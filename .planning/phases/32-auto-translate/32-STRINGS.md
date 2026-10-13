# Phase 32 — strings to sign (en | de | fr | ar)

Source: `32-UI-SPEC.md` § Copywriting Contract (revised 2026-10-13). These are the exact strings in the prototype patch (`32-prototype-wip.patch`): the dashboard page `T` table of `OpsSupportTicket.dc.html` and `app/vamos-i18n-dict.js` carry the same characters. `%s` is the language name (Intl, in the dashboard language); in the dictionary it is a `patterns` entry (`$1`). Swiss German uses "ss", never ß. No vendor name and no word "machine" appears anywhere.

(existing) = the English text is already in the dictionary or the page table and its translation is reused verbatim.

## B. Support ticket (OpsSupportTicket.dc.html)

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| answer (page table; added to the dictionary) | Answer by e-mail | Per E-Mail antworten | Répondre par e-mail | الرد عبر البريد الإلكتروني |
| translatedFrom | Translated from %s | Übersetzt (Original: %s) | Traduit (original : %s) | تُرجم من %s |
| translatedNoLang | Translated | Übersetzt | Traduit | مترجم |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| replyLabel | Your reply | Ihre Antwort | Votre réponse | ردّك |
| replyPh | Write in your language. | Schreiben Sie in Ihrer Sprache. | Écrivez dans votre langue. | اكتب بلغتك. |
| replyHint | The button opens a reply in your mail app. The customer gets it in their language, with your text below. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Der Kunde erhält sie in seiner Sprache, Ihr Text steht darunter. | Le bouton ouvre une réponse dans votre messagerie. Le client la reçoit dans sa langue, votre texte en dessous. | يفتح الزر ردًا في تطبيق بريدك. يتلقاه العميل بلغته، ونصّك تحته. |
| replyHintSame | The button opens a reply in your mail app. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. | Le bouton ouvre une réponse dans votre messagerie. | يفتح الزر ردًا في تطبيق بريدك. |
| replyHintRaw | The button opens a reply in your mail app. Your text stays as written: the customer’s language is not one of our four. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Ihr Text bleibt unverändert: Die Sprache des Kunden gehört nicht zu unseren vier. | Le bouton ouvre une réponse dans votre messagerie. Votre texte reste tel quel : la langue du client ne fait pas partie de nos quatre. | يفتح الزر ردًا في تطبيق بريدك. يبقى نصّك كما هو: لغة العميل ليست من لغاتنا الأربع. |
| replyUntranslated | Couldn’t translate. The e-mail opened with your text as written. | Übersetzung nicht möglich. Die E-Mail wurde mit Ihrem Text unverändert geöffnet. | Traduction impossible. L’e-mail s’est ouvert avec votre texte tel quel. | تعذّرت الترجمة. فُتح البريد بنصّك كما كتبته. |
| replyReady | Translation ready. Press the button again to open your mail. | Übersetzung fertig. Drücken Sie die Schaltfläche erneut, um Ihr E-Mail-Programm zu öffnen. | Traduction prête. Appuyez de nouveau sur le bouton pour ouvrir votre messagerie. | الترجمة جاهزة. اضغط الزر مرة أخرى لفتح تطبيق البريد. |
| mailTooLong | Your original text was left out: it is too long for your mail app link. | Ihr Originaltext wurde weggelassen: Er ist zu lang für den Link Ihres E-Mail-Programms. | Votre texte d’origine a été retiré : il est trop long pour le lien de votre messagerie. | حُذف نصّك الأصلي لأنه أطول من أن يتسع له رابط تطبيق البريد. |

`translating` and `trNotAvailable` are also used by C.

## C. Home review card (Reviews.dc.html)

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| rvTranslate | Translate | Übersetzen | Traduire | ترجمة |
| rvShowOriginal | Show original | Original anzeigen | Afficher l’original | عرض النص الأصلي |
| translating (above) | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable (above) | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |

## A. Rail and Content, Pricing

No new strings. The rail keeps "Content" and "Reviews" (existing). Pricing keeps "Translated automatically. Edit if needed." (existing). Removed with Pages and Legal: rail labels `Pages`, `Legal`.
