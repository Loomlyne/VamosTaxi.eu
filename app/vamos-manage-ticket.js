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

  function fromAccount(row) {
    var status = String((row && row.status) || "");
    if (status === "unpaid") status = "pending";
    if (status === "new" || status === "confirmed") status = "confirmed";
    return {
      id: (row && row.id) || "",
      reference: (row && (row.ref || row.reference)) || "",
      status: status,
      pickupText: (row && row.pickup) || "",
      dropoffText: (row && row.dropoff) || "",
      scheduledLocal: "",
      dateLabel: (row && row.date) || "",
      timeLabel: (row && row.time) || "",
      flightNo: "",
      pax: (row && row.pax) || 1,
      bags: 0,
      driver: null,
      money: null,
      refundStatus: "none",
      refundOwedRappen: 0,
      reviewSubmitted: false,
      canCancel: false,
      cancelWindow: "none",
      contactName: "",
      contactEmail: "",
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
        }
        return { kind: "booking", booking: booking, via: "account" };
      });
    });
  }

  function cancelGuest(tok) {
    var body = tok ? JSON.stringify({ token: tok }) : "{}";
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

  function refundLine(booking) {
    var st = String((booking && booking.refundStatus) || "").toLowerCase();
    if (st === "pending_ops") {
      // Full refund owed (cancel more than 24 h ahead) reads as such; without an owed amount our team is still deciding.
      var owed = Number(booking && booking.refundOwedRappen);
      return owed > 0 ? t("Full refund · sent by our team") : t("Refund under review");
    }
    if (st === "processing") return t("Processing");
    if (st === "refunded") return t("Refunded");
    if (st === "failed") return t("Failed");
    return "";
  }

  function refundedCopy(booking) {
    if (!booking || String(booking.refundStatus).toLowerCase() !== "refunded") return "";
    var country = booking.payoutCountryLabel || t("Switzerland");
    var line = t("Refunded to your {country} card.").replace("{country}", country);
    if (booking.availableOn) {
      var d = String(booking.availableOn).slice(0, 10);
      line += " " + t("Stripe pays out on {date}.").replace("{date}", d);
    }
    return line;
  }

  root.VamosManageTicket = {
    NOT_FOUND: NOT_FOUND,
    GONE: GONE,
    t: t,
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
    refundLine: refundLine,
    refundedCopy: refundedCopy,
  };
})(window);
