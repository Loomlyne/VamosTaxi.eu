window.__homeI18n = window.__homeI18n || [];
window.__homeI18n.push({
  strings: {
    'Reviews': { de: 'Bewertungen', fr: 'Avis', ar: 'التقييمات' },
    'What travellers say.': { de: 'Das sagen Reisende.', fr: 'Ce que disent les voyageurs.', ar: 'ماذا يقول المسافرون.' },
    'Review scores by platform': { de: 'Bewertungen nach Plattform', fr: 'Notes par plateforme', ar: 'التقييمات حسب المنصة' },
    '1 review': { de: '1 Bewertung', fr: '1 avis', ar: 'تقييم واحد' },
    'Collected by us': { de: 'Von uns gesammelt', fr: 'Recueilli par nos soins', ar: 'جمعناه نحن' },
    'Read on Google': { de: 'Auf Google lesen', fr: 'Lire sur Google', ar: 'اقرأ التقييم على Google' },
    'Read on Tripadvisor': { de: 'Auf Tripadvisor lesen', fr: 'Lire sur Tripadvisor', ar: 'اقرأ التقييم على Tripadvisor' },
    'Read on Trustpilot': { de: 'Auf Trustpilot lesen', fr: 'Lire sur Trustpilot', ar: 'اقرأ التقييم على Trustpilot' },
  },
  patterns: [
    { re: /^(\d+) reviews$/, de: '$1 Bewertungen', fr: '$1 avis', ar: '$1 تقييمًا' },
    { re: /^Rated (\d) out of 5$/, de: 'Bewertet mit $1 von 5', fr: 'Noté $1 sur 5', ar: 'التقييم $1 من 5' },
  ],
});
