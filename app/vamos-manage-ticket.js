/* Shared live fetch for manage-booking + booking-detail DC ticket chrome.
   Absolute /api/… because <base href> rewrites relative URLs. Never paints TRIP. */
(function (root) {
  var NOT_FOUND =
    "We could not find this booking. Check the link in your confirmation email.";
  var GONE = "This booking is gone. Start a new trip from home.";

  function t(en) {
    return root.VamosLocale && typeof root.VamosLocale.t === "function"
      ? root.VamosLocale.t(en)
      : en;
  }

  // 261002: the reader's language for dates and country names. The same four-locale map as the home
  // WhenPicker (app/home/WhenPicker.dc.html loc()); digits stay Latin in Arabic.
  var LOCALES = { en: "en-GB", de: "de-CH", fr: "fr-CH", ar: "ar-u-nu-latn" };

  function lang() {
    var l = "en";
    try {
      var v = root.VamosLocale && root.VamosLocale.lang;
      l = (typeof v === "function" ? v() : v) || "en";
    } catch (e) {}
    return LOCALES[l] ? l : "en";
  }

  // "2026-10-06" or "2026-10-06T08:15" -> "Tue 6 Oct" / "Di. 6. Okt." / "mar. 6 oct." / "الثلاثاء، 6 أكتوبر".
  // The day at UTC noon, formatted in UTC, so the label never shifts with the reader's time zone; commas
  // out, as the home picker does. "" when there is no day. Pages call it while rendering, so a language
  // switch re-labels every date.
  function dayLabel(isoOrLocal) {
    var m = String(isoOrLocal || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    var noon = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
    try {
      return new Intl.DateTimeFormat(LOCALES[lang()], {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(noon)
        .replace(/,/g, "");
    } catch (e) {
      return m[1] + "-" + m[2] + "-" + m[3];
    }
  }

  function params() {
    try {
      return new URLSearchParams(String(location.search || ""));
    } catch (e) {
      return new URLSearchParams();
    }
  }

  function token() {
    return String(params().get("token") || params().get("mb") || "").trim();
  }

  function refQuery() {
    return String(params().get("ref") || params().get("reference") || "").trim();
  }

  function isDetail() {
    return /booking-detail/.test(String(location.pathname || ""));
  }

  function jsonFetch(url, opt) {
    return fetch(
      url,
      Object.assign({ credentials: "same-origin", cache: "no-store" }, opt || {}),
    ).then(function (res) {
      return res
        .json()
        .then(function (body) {
          return { ok: res.ok, status: res.status, body: body || {} };
        })
        .catch(function () {
          return { ok: res.ok, status: res.status, body: {} };
        });
    });
  }

  function loadGuest(tok) {
    var url = tok
      ? "/api/manage/booking?token=" + encodeURIComponent(tok)
      : "/api/manage/booking";
    return jsonFetch(url).then(
      function (r) {
        if (r.ok && r.body && r.body.ok && r.body.booking) {
          return { kind: "booking", booking: r.body.booking, via: "token" };
        }
        if (r.body && r.body.code === "gone") {
          return { kind: "gone", error: r.body.error || GONE };
        }
        return { kind: "not-found", error: (r.body && r.body.error) || NOT_FOUND };
      },
    );
  }

  // 261002: the account list's status words -> the booking page's. The list folds paid, confirmed and
  // assigned into "booked" (any status it does not name, in practice partially_cancelled, becomes "new");
  // the design-system badge has no such keys and fell back to "Awaiting payment". The details answer then
  // replaces this with the booking's own status (paid, assigned, partially_cancelled, ...).
  var ACCOUNT_STATUS = { booked: "confirmed", "new": "confirmed", awaiting_payment: "pending", unpaid: "pending" };

  function fromAccount(row) {
    var status = String((row && row.status) || "");
    status = ACCOUNT_STATUS[status] || status;
    return {
      id: (row && row.id) || "",
      reference: (row && (row.ref || row.reference)) || "",
      status: status,
      pickupText: (row && row.pickup) || "",
      dropoffText: (row && row.dropoff) || "",
      // 26.2 P6 (D13): the day and time as booked, so a time change from the account view has its day.
      // 261002: no English date label here any more; the pages label the day and time from this, in the
      // reader's language, every time they render.
      scheduledLocal: row && row.dateIso && row.time ? row.dateIso + "T" + row.time : "",
      // 26.2 P6 (D19): the flight number as booked, so the flight row shows and can be changed here too.
      flightNo: (row && row.flightNo) || "",
      pax: (row && row.pax) || 1,
      bags: 0,
      driver: null,
      money: null,
      refundStatus: "none",
      refundOwedRappen: 0,
      // 261002: whether it was reviewed comes from the list; whether Cancel shows, and its window, from the
      // details answer (loadAccount). Until that answer lands there is no Cancel.
      reviewSubmitted: !!(row && row.reviewState === "reviewed"),
      canCancel: false,
      cancelWindow: "none",
      contactName: "",
      // 26.2 P6 (D19): the booking's address, so "Send it again to …" and "Confirmation sent to" name it.
      contactEmail: (row && row.contactEmail) || "",
      payoutCountry: null,
      payoutCountryLabel: null,
      availableOn: null,
      priceTotalRappen: (row && row.priceRappen) || 0,
    };
  }

  function loadAccount(ref) {
    return jsonFetch("/api/account/bookings").then(function (r) {
      if (!r.ok) return { kind: "not-found", error: NOT_FOUND };
      var list = (r.body && r.body.bookings) || [];
      if (!Array.isArray(list)) list = [];
      var want = String(ref || "")
        .replace(/\s+/g, "")
        .toUpperCase();
      if (!want) return { kind: "not-found", error: NOT_FOUND };
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        var key = String((list[i] && (list[i].ref || list[i].reference)) || "")
          .replace(/\s+/g, "")
          .toUpperCase();
        if (key === want) {
          hit = list[i];
          break;
        }
      }
      if (!hit) return { kind: "not-found", error: NOT_FOUND };
      var booking = fromAccount(hit);
      var wantRef = encodeURIComponent(booking.reference);
      // Money and driver for this booking; a failed read leaves both blocks empty.
      return jsonFetch("/api/account/bookings/details?ref=" + wantRef).then(function (d) {
        if (d.ok && d.body && d.body.ok) {
          booking.money = d.body.money || null;
          booking.driver = d.body.driver || null;
          // 20-10: the refund row and box survive a reload.
          booking.refundStatus = d.body.refundStatus || "none";
          booking.refundOwedRappen = Number(d.body.refundOwedRappen) || 0;
          booking.refundedRappen = Number(d.body.refundedRappen) || 0;
          // 261002: the booking's own status (paid, assigned, partially_cancelled, ...), whether Cancel shows
          // and in which window, and whether it was reviewed. A failed read leaves "no Cancel" from fromAccount.
          if (d.body.status) booking.status = String(d.body.status);
          booking.canCancel = d.body.canCancel === true;
          booking.cancelWindow =
            d.body.cancelWindow === "auto_full" || d.body.cancelWindow === "pending_ops" ? d.body.cancelWindow : "none";
          if (typeof d.body.reviewSubmitted === "boolean") booking.reviewSubmitted = d.body.reviewSubmitted;
        }
        return { kind: "booking", booking: booking, via: "account" };
      });
    });
  }

  // The booking on screen goes with the cancel: vt_manage is one cookie for the whole site, and the
  // server refuses (409 wrong-booking) a cancel for any other booking than the cookie's.
  function cancelGuest(tok, ref) {
    var payload = {};
    if (tok) payload.token = tok;
    if (ref) payload.ref = ref;
    var body = JSON.stringify(payload);
    return jsonFetch("/api/manage/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body,
    });
  }

  function cancelAccount(ref) {
    return jsonFetch("/api/account/bookings/paid-cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: ref }),
    });
  }

  function timeChangeGuest(tok, ref, scheduledLocal) {
    return jsonFetch("/api/manage/time-change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: tok || "", ref: ref, scheduled_local: scheduledLocal }),
    });
  }

  function timeChangeAccount(ref, scheduledLocal) {
    return jsonFetch("/api/account/bookings/time-change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: ref, scheduled_local: scheduledLocal }),
    });
  }

  function saveFlightGuest(tok, ref, flightNo) {
    return jsonFetch("/api/manage/flight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: tok || "", ref: ref, flight_no: flightNo }),
    });
  }

  function saveFlightAccount(ref, flightNo) {
    return jsonFetch("/api/account/bookings/flight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: ref, flight_no: flightNo }),
    });
  }

  // 26.2 P6 (D19): "Resend email" sends the confirmation again (voucher, fresh manage link) to the
  // booking's own address. The answer carries that address; a send that did not happen is not ok.
  function resendGuest(tok, ref) {
    return jsonFetch("/api/manage/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: tok || "", ref: ref }),
    });
  }

  function resendAccount(ref) {
    return jsonFetch("/api/account/bookings/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: ref }),
    });
  }

  function refundLine(booking) {
    var st = String((booking && booking.refundStatus) || "").toLowerCase();
    if (st === "pending_ops") {
      // 26.2 P1: on a trip that still runs, "refund due" is a cheaper class change waiting for the
      // team's Refund; the cancel line below would promise a full refund that is not owed.
      var bs = String((booking && booking.status) || "").toLowerCase();
      if (bs && bs !== "cancelled" && bs !== "refunded" && bs !== "partially_cancelled") return "";
      // Full refund owed (cancel more than 24 h ahead) reads as such; without an owed amount our team is still deciding.
      var owed = Number(booking && booking.refundOwedRappen);
      return owed > 0 ? t("Full refund · sent by our team") : t("Refund under review");
    }
    if (st === "processing") return t("Processing");
    if (st === "refunded") return t("Refunded");
    if (st === "failed") return t("Failed");
    return "";
  }

  // 26.2 P1 (owner-approved 2026-10-01, .planning/decisions/2026-10-01-class-change-pay-mail.md): after a
  // CHEAPER class change the team owes the difference ("Refund due"). Until the refund is sent the
  // booking page says so, in the new class and the amount still due; once it is sent the line goes.
  var CHANGE_CREDIT_LINE = "Your trip now runs in {class}. The difference of {amount} comes back to the payment method you used; our team sends it.";
  // 26.2 P6 (owner-approved 2026-10-01, D15 in .planning/decisions/2026-10-01-p6-paid-trip-edit.md):
  // after a CHEAPER change of places or time (any change that is not the class alone), until the
  // refund is sent. A class-only change keeps the line above.
  var TRIP_CREDIT_LINE = "Your trip has changed. The difference of {amount} comes back to the payment method you used; our team sends it.";

  function changeCreditLine(booking) {
    if (!booking) return "";
    var bs = String(booking.status || "").toLowerCase();
    if (!bs || bs === "cancelled" || bs === "refunded" || bs === "partially_cancelled") return "";
    var st = String(booking.refundStatus || "").toLowerCase();
    if (st !== "pending_ops" && st !== "processing" && st !== "failed") return "";
    var due = (Number(booking.refundOwedRappen) || 0) - (Number(booking.refundedRappen) || 0);
    if (!(due > 0)) return "";
    var amount = (due / 100).toFixed(2);
    var money = root.VamosLocale && typeof root.VamosLocale.money === "function"
      ? root.VamosLocale.money(amount)
      : "CHF " + amount;
    if (booking.money && booking.money.lastChange === "trip") {
      return t(TRIP_CREDIT_LINE).split("{amount}").join(money);
    }
    var cls = String((booking.money && booking.money.className) || "").trim();
    if (!cls) return "";
    return t(CHANGE_CREDIT_LINE).split("{class}").join(cls).split("{amount}").join(money);
  }

  // 261002: the country of the card the refund went to, in the reader's language: from the ISO code
  // (CH when none came) through the browser's region names, else the server's English label, else Switzerland.
  function countryName(booking) {
    var code = String((booking && booking.payoutCountry) || "CH").toUpperCase();
    try {
      var name = new Intl.DisplayNames([lang()], { type: "region" }).of(code);
      if (name && code !== "ZZ" && name.toUpperCase() !== code) return name;
    } catch (e) {}
    var label = booking && booking.payoutCountryLabel;
    return label ? t(label) : t("Switzerland");
  }

  function refundedCopy(booking) {
    if (!booking || String(booking.refundStatus).toLowerCase() !== "refunded") return "";
    var line = t("Refunded to your {country} card.").replace("{country}", countryName(booking));
    // The day Stripe pays out, labelled like every other date on the page.
    var day = booking.availableOn ? dayLabel(booking.availableOn) : "";
    // A day that ends in a full stop ("mar. 6 oct.") must not leave two at the end of the sentence.
    if (day) line += " " + t("Stripe pays out on {date}.").replace("{date}", day).replace(/\.\.$/, ".");
    return line;
  }

  root.VamosManageTicket = {
    NOT_FOUND: NOT_FOUND,
    GONE: GONE,
    t: t,
    LOCALES: LOCALES,
    lang: lang,
    dayLabel: dayLabel,
    token: token,
    refQuery: refQuery,
    isDetail: isDetail,
    loadGuest: loadGuest,
    loadAccount: loadAccount,
    cancelGuest: cancelGuest,
    cancelAccount: cancelAccount,
    timeChangeGuest: timeChangeGuest,
    timeChangeAccount: timeChangeAccount,
    saveFlightGuest: saveFlightGuest,
    saveFlightAccount: saveFlightAccount,
    resendGuest: resendGuest,
    resendAccount: resendAccount,
    refundLine: refundLine,
    refundedCopy: refundedCopy,
    changeCreditLine: changeCreditLine,
  };
})(window);
