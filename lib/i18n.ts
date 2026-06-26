export type Lang = 'en' | 'ms'

const translations = {
  en: {
    // Nav
    dashboard: 'Dashboard',
    records: 'Records',
    profile: 'Profile',
    settings: 'Settings',
    // Dashboard headers
    reliefMaximiser: 'Relief Maximiser',
    whatIfScenarios: 'What-If Scenarios',
    monthlyTargets: 'Monthly Targets',
    overview: 'Overview',
    compareYears: 'Compare Years',
    reliefBreakdown: 'Relief Breakdown',
    taxSummary: 'Tax Summary',
    // Tax hero
    taxRefund: 'Estimated Refund',
    taxOwed: 'Estimated Tax Owed',
    balanced: 'Balanced',
    netTaxBalance: 'Net Tax Balance',
    breakdownLabel: 'Based on YA {year} records',
    // Actions
    addRecord: 'Add Record',
    downloadReport: 'Download Tax Report',
    exportCSV: 'Export CSV',
    lhdnReference: 'LHDN Reference',
    auditPack: 'Audit Pack',
    eBEWorksheet: 'e-BE Worksheet',
    viewAll: 'View All',
    // Filing
    filingChecklist: 'Filing Checklist — YA {year}',
    daysUntilDeadline: '{days} days until Apr 30 filing deadline',
    // Cards
    monthlyPace: 'Monthly pace',
    monthsLeft: '{n} months left in {year}',
    addPerWeek: 'Add ~{amt}/wk to max out',
    projectedByDec: '≈ {amt} by Dec',
    // Records tab
    searchRecords: 'Search records…',
    noRecords: 'No records yet',
    addFirstRecord: 'Add your first record to start tracking tax reliefs',
    // Profile tab
    personalDetails: 'Personal Details',
    incomeDetails: 'Income Details',
    maritalStatus: 'Marital Status',
    children: 'Children',
    // Settings tab
    appearance: 'Appearance',
    language: 'Language',
    defaultTaxYear: 'Default Tax Year',
    privacyMode: 'Privacy Mode',
    privacyModeDesc: 'Hide all RM amounts on screen',
    // Notifications
    allCaughtUp: 'All caught up',
    markAllRead: 'Mark all read',
    // Misc
    claimed: 'Claimed',
    limit: 'Limit',
    remaining: 'Remaining',
    potential: 'Potential',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    upload: 'Upload',
    amount: 'Amount',
    date: 'Date',
    merchant: 'Merchant / Provider',
    category: 'Category',
    description: 'Description',
    status: 'Status',
    refund: 'Refund',
    taxOwedShort: 'Tax Owed',
    effectiveRate: 'Effective Rate',
    chargeableIncome: 'Chargeable Income',
  },
  ms: {
    // Nav
    dashboard: 'Papan Pemuka',
    records: 'Rekod',
    profile: 'Profil',
    settings: 'Tetapan',
    // Dashboard headers
    reliefMaximiser: 'Pengoptimum Pelepasan',
    whatIfScenarios: 'Senario Bagaimana Jika',
    monthlyTargets: 'Sasaran Bulanan',
    overview: 'Gambaran Keseluruhan',
    compareYears: 'Bandingkan Tahun',
    reliefBreakdown: 'Pecahan Pelepasan',
    taxSummary: 'Ringkasan Cukai',
    // Tax hero
    taxRefund: 'Anggaran Bayaran Balik',
    taxOwed: 'Anggaran Cukai Perlu Dibayar',
    balanced: 'Seimbang',
    netTaxBalance: 'Baki Cukai Bersih',
    breakdownLabel: 'Berdasarkan rekod TA {year}',
    // Actions
    addRecord: 'Tambah Rekod',
    downloadReport: 'Muat Turun Laporan Cukai',
    exportCSV: 'Eksport CSV',
    lhdnReference: 'Rujukan LHDN',
    auditPack: 'Pek Audit',
    eBEWorksheet: 'Lembaran Kerja e-BE',
    viewAll: 'Lihat Semua',
    // Filing
    filingChecklist: 'Senarai Semak Pemfailan — TA {year}',
    daysUntilDeadline: '{days} hari sebelum tarikh akhir pemfailan 30 Apr',
    // Cards
    monthlyPace: 'Kadar bulanan',
    monthsLeft: '{n} bulan lagi dalam {year}',
    addPerWeek: 'Tambah ~{amt}/minggu untuk capai had',
    projectedByDec: '≈ {amt} menjelang Dis',
    // Records tab
    searchRecords: 'Cari rekod…',
    noRecords: 'Tiada rekod lagi',
    addFirstRecord: 'Tambah rekod pertama anda untuk mula menjejak pelepasan cukai',
    // Profile tab
    personalDetails: 'Maklumat Peribadi',
    incomeDetails: 'Maklumat Pendapatan',
    maritalStatus: 'Status Perkahwinan',
    children: 'Anak-Anak',
    // Settings tab
    appearance: 'Penampilan',
    language: 'Bahasa',
    defaultTaxYear: 'Tahun Cukai Lalai',
    privacyMode: 'Mod Privasi',
    privacyModeDesc: 'Sembunyikan semua jumlah RM di skrin',
    // Notifications
    allCaughtUp: 'Semua dah selesai',
    markAllRead: 'Tandakan semua telah dibaca',
    // Misc
    claimed: 'Dituntut',
    limit: 'Had',
    remaining: 'Baki',
    potential: 'Potensi',
    save: 'Simpan',
    cancel: 'Batal',
    confirm: 'Sahkan',
    delete: 'Padam',
    edit: 'Edit',
    close: 'Tutup',
    upload: 'Muat Naik',
    amount: 'Jumlah',
    date: 'Tarikh',
    merchant: 'Pedagang / Pembekal',
    category: 'Kategori',
    description: 'Keterangan',
    status: 'Status',
    refund: 'Bayaran Balik',
    taxOwedShort: 'Cukai Perlu Dibayar',
    effectiveRate: 'Kadar Efektif',
    chargeableIncome: 'Pendapatan Boleh Dicaj',
  },
} as const

type TranslationKey = keyof typeof translations.en

export function useT(lang: Lang) {
  const t = translations[lang] ?? translations.en
  return function translate(key: TranslationKey, vars?: { [k: string]: string | number }): string {
    let str: string = (t as typeof translations.en)[key] ?? (translations.en[key] as string)
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v))
      })
    }
    return str
  }
}
