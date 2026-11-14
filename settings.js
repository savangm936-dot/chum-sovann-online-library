// Sovann sense — ថ្លៃចុះឈ្មោះសិស្សដំបូង $2.50 តែម្តង; មេរៀន N5–N1 ឥតគិតថ្លៃក្រោយអនុម័ត
// អាចបង្ហោះ file នេះសាធារណៈបាន ប៉ុន្តែកុំដាក់ PayWay API Key / Secret ឬកូដ VIP ក្នុងនេះ។
window.SOVANN_SETTINGS = {
  supabaseUrl: "",                    // ដាក់ URL Supabase Project
  supabasePublishableKey: "",          // public / anon key ប៉ុណ្ណោះ
  qrImage: "assets/aba-khqr-2-50-preview.png", // Dynamic QR គំរូ
  qrApprovedForPayments: false,        // កុំប្តូរទៅ true ដរាបណា ABA មិនបញ្ជាក់
  paywayPaymentLink: ""                // Payment Link HTTPS ផ្លូវការសម្រាប់កញ្ចប់ $2.50 ពី ABA PayWay
};
