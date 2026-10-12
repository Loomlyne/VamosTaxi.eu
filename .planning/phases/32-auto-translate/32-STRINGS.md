# Phase 32 — strings to sign (en | de | fr | ar)

Source: `32-UI-SPEC.md` § Copywriting Contract (revised 2026-10-12 19:49, plus the loadError / curly-apostrophe edit). These are the exact strings in the prototype patch (`32-prototype-wip.patch`): the page `T` tables and the `app/vamos-i18n-dict.js` block are generated from this one list, so they match character for character. Swiss German "ss" (no ß anywhere). Badge, button and tab labels are shown in sentence case; the kit uppercases them. `%s` is filled at run time (language name from `Intl`, first letter capitalised; or the placeholder list).

(existing) = the English text is already in `app/vamos-i18n-dict.js` and its translation is reused verbatim; nothing is changed for it.

## Translations screen and editor (OpsContent.dc.html, OpsSidebar.dc.html)

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| navTranslations | Translations | Übersetzungen | Traductions | الترجمات |
| translationsSub | Every line on the site and in e-mails, in four languages | Jede Zeile der Website und der E-Mails in vier Sprachen | Chaque ligne du site et des e-mails, en quatre langues | كل سطر في الموقع وفي رسائل البريد، بأربع لغات |
| searchPh | Search a line | Zeile suchen | Rechercher une ligne | ابحث عن سطر |
| fAll (existing) | All | Alle | Tous | الكل |
| fMachine | Machine | Maschinell | Automatique | آلي |
| fYours | Yours | Von Ihnen | Les vôtres | من كتابتك |
| fFailed (existing) | Failed | Fehlgeschlagen | Échoué | فشل |
| filterLabel (existing) | Filter | Filter | Filtre | تصفية |
| placeLabel (existing) | Where | Wo | Où | أين |
| placeAll | All places | Alle Bereiche | Tous les endroits | كل المواضع |
| placeSite | Site | Website | Site | الموقع |
| placeEmail | E-mails | E-Mails | E-mails | رسائل البريد |
| placeExtra (existing) | Extras | Zusätze | Options | إضافات |
| placeOneSite | Site | Website | Site | الموقع |
| placeOneEmail | E-mail | E-Mail | E-mail | بريد إلكتروني |
| placeOneExtra | Extra | Zusatz | Option | إضافة |
| colEn | English | Englisch | Anglais | الإنجليزية |
| colDe | German | Deutsch | Allemand | الألمانية |
| colFr | French | Französisch | Français | الفرنسية |
| colAr | Arabic | Arabisch | Arabe | العربية |
| langTabs (existing) | Language | Sprache | Langue | اللغة |
| markMachine | Machine | Maschinell | Automatique | آلي |
| markFailed | Not translated | Nicht übersetzt | Non traduit | غير مترجم |
| markLocked | Never translated | Nie übersetzt | Jamais traduit | لا تُترجم أبدًا |
| shownEnglish | Shows English | Zeigt Englisch | Affiche l’anglais | يعرض الإنجليزية |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| englishChanged | English changed since your translation. Your text stays. | Das Englische hat sich seit Ihrer Übersetzung geändert. Ihr Text bleibt, wie er ist. | L’anglais a changé depuis votre traduction. Votre texte reste tel quel. | تغيّر النص الإنجليزي منذ ترجمتك. يبقى نصّك كما هو. |
| showMore | Show more | Mehr anzeigen | Afficher plus | عرض المزيد |
| clearFilters (existing) | Clear filters | Filter zurücksetzen | Effacer les filtres | مسح عوامل التصفية |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |
| emptyAllTitle | No lines yet | Noch keine Zeilen | Aucune ligne pour l’instant | لا توجد أسطر بعد |
| emptyAllBody | Lines appear here once the site and e-mails have text to translate. | Zeilen erscheinen hier, sobald die Website und die E-Mails Text zum Übersetzen haben. | Les lignes apparaissent ici dès que le site et les e-mails ont du texte à traduire. | تظهر الأسطر هنا بمجرد أن يكون للموقع والرسائل نص للترجمة. |
| emptyFailedTitle | Nothing failed | Nichts fehlgeschlagen | Aucun échec | لا شيء فاشل |
| emptyFailedBody | Every line has a translation. | Jede Zeile hat eine Übersetzung. | Chaque ligne a une traduction. | لكل سطر ترجمة. |
| emptyYoursTitle | Nothing of yours yet | Noch nichts von Ihnen | Aucune ligne écrite par vous pour l’instant | لا شيء من كتابتك بعد |
| emptyYoursBody | Lines you write yourself appear here. | Zeilen, die Sie selbst schreiben, erscheinen hier. | Les lignes que vous écrivez vous-même apparaissent ici. | تظهر هنا الأسطر التي تكتبها بنفسك. |
| emptyMachineTitle | No machine lines | Keine maschinellen Zeilen | Aucune ligne automatique | لا توجد أسطر آلية |
| emptyMachineBody | Every line is yours or never translated. | Jede Zeile stammt von Ihnen oder wird nie übersetzt. | Chaque ligne est de vous ou n’est jamais traduite. | كل سطر من كتابتك أو لا يُترجم أبدًا. |
| noMatchTitle | No lines match | Keine passenden Zeilen | Aucune ligne ne correspond | لا توجد أسطر مطابقة |
| noMatchBody | Try another word or clear the filters. | Versuchen Sie ein anderes Wort oder setzen Sie die Filter zurück. | Essayez un autre mot ou effacez les filtres. | جرّب كلمة أخرى أو امسح عوامل التصفية. |
| loadError | Couldn’t load translations. Try again. | Übersetzungen konnten nicht geladen werden. Bitte erneut versuchen. | Impossible de charger les traductions. Réessayez. | تعذّر تحميل الترجمات. حاول مرة أخرى. |
| edTitle | Edit translations | Übersetzungen bearbeiten | Modifier les traductions | تعديل الترجمات |
| edSource | English (source) | Englisch (Quelle) | Anglais (source) | الإنجليزية (المصدر) |
| hintMachine | Machine text. Edit it if you like. | Maschineller Text. Passen Sie ihn bei Bedarf an. | Texte automatique. Modifiez-le si vous le souhaitez. | نص آلي. عدّله إن رغبت. |
| hintYours | Your text. The machine won’t change it. | Ihr Text. Die Maschine ändert ihn nicht. | Votre texte. La machine ne le modifiera pas. | نصّك. لن تغيّره الآلة. |
| failedExplain | The machine answer failed its checks, so the site shows the English text until you write this line. | Die maschinelle Antwort hat die Prüfungen nicht bestanden, deshalb zeigt die Website den englischen Text, bis Sie diese Zeile schreiben. | La réponse automatique n’a pas passé les contrôles, le site affiche donc le texte anglais jusqu’à ce que vous écriviez cette ligne. | لم تجتز الإجابة الآلية الفحوصات، لذا يعرض الموقع النص الإنجليزي إلى أن تكتب هذا السطر. |
| lockedLegal | Legal text. It is never translated by the machine and stays exactly as approved. | Rechtstext. Er wird nie maschinell übersetzt und bleibt genau wie freigegeben. | Texte juridique. Il n’est jamais traduit automatiquement et reste exactement tel qu’approuvé. | نص قانوني. لا تترجمه الآلة أبدًا ويبقى كما تمت الموافقة عليه تمامًا. |
| lockedApproved | Wording you approved. It is never translated by the machine and stays exactly as written. | Formulierung, die Sie freigegeben haben. Sie wird nie maschinell übersetzt und bleibt genau so. | Formulation que vous avez approuvée. Elle n’est jamais traduite automatiquement et reste telle quelle. | صياغة وافقت عليها. لا تترجمها الآلة أبدًا وتبقى كما كُتبت تمامًا. |
| lockedName | Product name or code. It stays the same in every language. | Produktname oder Code. Er bleibt in jeder Sprache gleich. | Nom de produit ou code. Il reste identique dans toutes les langues. | اسم منتج أو رمز. يبقى كما هو في كل اللغات. |
| closeBtn (existing) | Close | Schliessen | Fermer | إغلاق |
| keepTokens | Keep these exactly as in English: %s | Behalten Sie diese genau wie im Englischen bei: %s | Conservez-les exactement comme en anglais : %s | أبقِها كما هي في الإنجليزية تمامًا: %s |
| emptyLine | This line can’t be empty. | Diese Zeile darf nicht leer sein. | Cette ligne ne peut pas être vide. | لا يمكن ترك هذا السطر فارغًا. |
| save | Save translations | Übersetzungen speichern | Enregistrer les traductions | حفظ الترجمات |
| saving | Saving… | Wird gespeichert … | Enregistrement… | جارٍ الحفظ… |
| saved (existing) | Saved | Gespeichert | Enregistré | تم الحفظ |
| saveError | Couldn’t save. Try again. | Speichern nicht möglich. Bitte erneut versuchen. | Enregistrement impossible. Réessayez. | تعذّر الحفظ. حاول مرة أخرى. |
| discardTitle | Discard your changes? | Änderungen verwerfen? | Abandonner vos modifications ? | تجاهل تعديلاتك؟ |
| keepEditing (existing) | Keep editing | Weiter bearbeiten | Continuer à modifier | متابعة التعديل |
| discard (existing) | Discard changes | Änderungen verwerfen | Abandonner les modifications | تجاهل التعديلات |

## Pricing extras fields (OpsPricing.dc.html, rendered by OpsTable.dc.html)

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| markMachine | Machine | Maschinell | Automatique | آلي |
| markFailed | Not translated | Nicht übersetzt | Non traduit | غير مترجم |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| englishChanged | English changed since your translation. Your text stays. | Das Englische hat sich seit Ihrer Übersetzung geändert. Ihr Text bleibt, wie er ist. | L’anglais a changé depuis votre traduction. Votre texte reste tel quel. | تغيّر النص الإنجليزي منذ ترجمتك. يبقى نصّك كما هو. |
| extraPending | Filled in by the machine when you save. | Wird beim Speichern maschinell ergänzt. | Complété automatiquement à l’enregistrement. | تملؤه الآلة عند الحفظ. |
| extraMachine | Machine translation. Edit it if needed. | Maschinelle Übersetzung. Bei Bedarf anpassen. | Traduction automatique. Modifiez-la si besoin. | ترجمة آلية. عدّلها عند الحاجة. |
| extraYours | Your text. The machine won’t change it. | Ihr Text. Die Maschine ändert ihn nicht. | Votre texte. La machine ne le modifiera pas. | نصّك. لن تغيّره الآلة. |
| extraMissing | No translation yet. Customers see the English name. | Noch keine Übersetzung. Kunden sehen den englischen Namen. | Pas encore de traduction. Les clients voient le nom en anglais. | لا توجد ترجمة بعد. يرى العملاء الاسم بالإنجليزية. |

## Support ticket thread and reply (OpsSupportTicket.dc.html)

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| translatedFrom | Translated from %s | Übersetzt (Original: %s) | Traduit (original : %s) | تُرجم من %s |
| translatedNoLang | Translated | Übersetzt | Traduit | مترجم |
| translating | Translating… | Wird übersetzt … | Traduction en cours… | جارٍ الترجمة… |
| trNotAvailable | Translation not available | Übersetzung nicht verfügbar | Traduction indisponible | الترجمة غير متاحة |
| replyLabel | Your reply | Ihre Antwort | Votre réponse | ردّك |
| replyPh | Write in your language. | Schreiben Sie in Ihrer Sprache. | Écrivez dans votre langue. | اكتب بلغتك. |
| replyHint | The button opens a reply in your mail app. The customer gets it in their language, with your text below. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. Der Kunde erhält sie in seiner Sprache, Ihr Text steht darunter. | Le bouton ouvre une réponse dans votre messagerie. Le client la reçoit dans sa langue, votre texte en dessous. | يفتح الزر ردًا في تطبيق بريدك. يتلقاه العميل بلغته، ونصّك تحته. |
| replyHintSame | The button opens a reply in your mail app. | Die Schaltfläche öffnet eine Antwort in Ihrem E-Mail-Programm. | Le bouton ouvre une réponse dans votre messagerie. | يفتح الزر ردًا في تطبيق بريدك. |
| sendIn | Send in | Senden auf | Envoyer en | الإرسال بـ |
| sendInCustomer | %s · customer | %s · Kunde | %s · client | %s · العميل |
| previewLabel | What the customer gets (%s) | Das erhält der Kunde (%s) | Ce que le client reçoit (%s) | ما يتلقاه العميل (%s) |
| previewEdited | Your edit. It stays as written. | Ihre Änderung. Sie bleibt so, wie Sie sie geschrieben haben. | Votre modification. Elle reste telle quelle. | تعديلك. يبقى كما كتبته. |
| translateAgain | Translate again | Erneut übersetzen | Traduire à nouveau | أعد الترجمة |
| previewFail | No translation. The e-mail will contain your text as written. | Keine Übersetzung. Die E-Mail enthält Ihren Text unverändert. | Pas de traduction. L’e-mail contiendra votre texte tel quel. | لا توجد ترجمة. سيحتوي البريد نصّك كما كتبته. |
| mailTooLong | Your original text was left out: it is too long for your mail app link. | Ihr Originaltext wurde weggelassen: Er ist zu lang für den Link Ihres E-Mail-Programms. | Votre texte d’origine a été retiré : il est trop long pour le lien de votre messagerie. | حُذف نصّك الأصلي لأنه أطول من أن يتسع له رابط تطبيق البريد. |
| tryAgain (existing) | Try again | Erneut versuchen | Réessayer | أعد المحاولة |
| markMachine | Machine | Maschinell | Automatique | آلي |

## Dictionary patterns (strings the code fills in)

| English pattern | German | French | Arabic |
|---|---|---|---|
| Translated from (.+) | Übersetzt (Original: $1) | Traduit (original : $1) | تُرجم من $1 |
| (.+) · customer | $1 · Kunde | $1 · client | $1 · العميل |
| What the customer gets \((.+)\) | Das erhält der Kunde ($1) | Ce que le client reçoit ($1) | ما يتلقاه العميل ($1) |
| Keep these exactly as in English: (.+) | Behalten Sie diese genau wie im Englischen bei: $1 | Conservez-les exactement comme en anglais : $1 | أبقِها كما هي في الإنجليزية تمامًا: $1 |

## Points for the owner or planner (found while building, not changed)

1. Same translation as an existing, different English entry (the dictionary is keyed by English, so switching a page back to English can show the other source line): "Couldn’t save. Try again." vs existing "Could not save. Try again." (identical de/fr/ar); "E-mail" vs existing "Email" (de E-Mail, fr E-mail); "Site" vs existing "Website" (de Website, ar الموقع); "Extra" vs existing "Add" (ar إضافة). Options: reuse the existing English text ("Could not save. Try again.", "Email", "Website") or give the new entry a distinct translation.
2. "Close", "Saved", "Try again" etc. are reused as they are; "Save" stays in the dictionary for other pages; this phase uses "Save translations".
