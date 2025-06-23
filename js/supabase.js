// SOSTITUISCI CON LE TUE CREDENZIALI!
const SUPABASE_URL = 'https://iacdceuvipmkhtievgpb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhY2RjZXV2aXBta2h0aWV2Z3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2NzQyMDUsImV4cCI6MjA2NjI1MDIwNX0.5WGtOWSzs5UkD9DkD14K3MlIgMPaVRbTQQp9MK1KC4U'

// Inizializza Supabase
const { createClient } = supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Utility functions
const showLoading = () => {
    const loading = document.getElementById('loading')
    if (loading) loading.classList.remove('hidden')
}

const hideLoading = () => {
    const loading = document.getElementById('loading')
    if (loading) loading.classList.add('hidden')
}

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div')
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500'
    
    toast.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50`
    toast.textContent = message
    
    document.body.appendChild(toast)
    
    setTimeout(() => toast.remove(), 3000)
}

// Check auth
const checkAuth = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession()
    return session
}

// Logout
const logout = async () => {
    await supabaseClient.auth.signOut()
    window.location.href = 'index.html'
}

// Export globally
window.supabaseClient = supabaseClient
window.utils = { showLoading, hideLoading, showToast, checkAuth, logout }

// Funzione helper per formattare le ore
function formatHours(hours) {
    if (!hours) return 'N/A'
    
    const h = parseFloat(hours)
    if (h === 1) return '1 ora'
    if (h % 1 === 0) return `${h} ore`
    
    // Per ore con decimali (es: 1.5 ore = 1 ora e 30 minuti)
    const wholeHours = Math.floor(h)
    const minutes = Math.round((h - wholeHours) * 60)
    
    if (wholeHours === 0) {
        return `${minutes} minuti`
    } else if (minutes === 0) {
        return `${wholeHours} ore`
    } else if (wholeHours === 1) {
        return `1 ora e ${minutes} minuti`
    } else {
        return `${wholeHours} ore e ${minutes} minuti`
    }
}

// Esporta globalmente
window.utils.formatHours = formatHours