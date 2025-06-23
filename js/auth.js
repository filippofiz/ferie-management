document.addEventListener('DOMContentLoaded', async () => {
    // Check if already logged in
    const session = await window.utils.checkAuth()
    if (session) {
        window.location.href = 'dashboard.html'
    }

    // Handle login
    const loginForm = document.getElementById('loginForm')
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const email = document.getElementById('email').value
        const password = document.getElementById('password').value
        
        window.utils.showLoading()
        
        try {
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email,
                password
            })
            
            if (error) throw error
            
            // Get profile to check role
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single()
            
            // Redirect based on role
            if (profile?.role === 'admin') {
                window.location.href = 'admin.html'
            } else {
                window.location.href = 'dashboard.html'
            }
            
        } catch (error) {
            console.error('Login error:', error)
            window.utils.showToast('Email o password non corretti', 'error')
        } finally {
            window.utils.hideLoading()
        }
    })
})