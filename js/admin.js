document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication and admin role
    const session = await window.utils.checkAuth()
    if (!session) {
        window.location.href = 'index.html'
        return
    }

    // Verify admin role
    const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

    if (!profile || profile.role !== 'admin') {
        window.location.href = 'dashboard.html'
        return
    }

    // Load admin data
    await loadAdminData(profile)
    
    // Hide loading
    window.utils.hideLoading()
})

async function loadAdminData(profile) {
    try {
        // Update welcome message
        document.getElementById('userName').textContent = profile.full_name

        // Load all data
        await Promise.all([
            loadEmployees(),
            loadPendingRequests(),
            loadStats()
        ])

        console.log('✅ Dati admin caricati')

    } catch (error) {
        console.error('Error loading admin data:', error)
        window.utils.showToast('Errore nel caricamento dei dati', 'error')
    }
}

async function loadEmployees() {
    try {
        const { data: employees, error } = await window.supabaseClient
            .from('profiles')
            .select(`
                *,
                employee_balances(*)
            `)
            .eq('role', 'employee')
            .eq('is_active', true)

        if (error) throw error

        console.log('👥 Dipendenti trovati:', employees.length)

        // Update total employees count
        const totalElement = document.getElementById('totalEmployees')
        if (totalElement) {
            totalElement.textContent = employees.length
        }

    } catch (error) {
        console.error('Error loading employees:', error)
    }
}

async function loadPendingRequests() {
    try {
        console.log('🔍 Caricando richieste pending...')
        
        // Query SENZA JOIN per evitare problemi RLS
        const { data: requests, error } = await window.supabaseClient
            .from('requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        console.log('📋 Query result:', { data: requests, error })

        if (error) throw error

        console.log('✅ Richieste trovate:', requests?.length || 0)

        // Update count
        const pendingElement = document.getElementById('pendingRequests')
        if (pendingElement) {
            pendingElement.textContent = requests?.length || 0
        }

        // Display requests
        const container = document.getElementById('recentRequests')
        if (!container) return

        if (!requests || requests.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">✅ Nessuna richiesta in attesa</div>'
            return
        }

        // Process each request
        let html = ''
        for (const request of requests) {
            // Get employee name separately
            let employeeName = 'Dipendente sconosciuto'
            let employeeEmail = ''
            
            try {
                const { data: employee } = await window.supabaseClient
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', request.employee_id)
                    .single()
                
                if (employee) {
                    employeeName = employee.full_name
                    employeeEmail = employee.email
                }
            } catch (err) {
                console.log('Warning: Could not load employee for request', request.id)
            }

            // Calcola durata e periodo con gestione orari
            let duration = ''
            let periodDisplay = ''

            if (request.type === 'ferie' || request.type === 'malattia') {
                duration = request.days ? `${request.days} giorni` : 'N/A'
                periodDisplay = `${request.start_date} ➔ ${request.end_date}`
            } else if (request.type === 'rol' || request.type === 'ex_festivita') {
                if (request.start_time && request.end_time) {
                    // Permesso orario
                    const hours = request.hours || 0
                    // Formatta le ore in modo più leggibile
                    if (hours === 1) {
                        duration = '1 ora'
                    } else if (hours % 1 === 0) {
                        duration = `${hours} ore`
                    } else {
                        // Per ore con decimali (es: 1.5 ore = 1 ora e 30 minuti)
                        const wholeHours = Math.floor(hours)
                        const minutes = Math.round((hours - wholeHours) * 60)
                        if (wholeHours === 0) {
                            duration = `${minutes} minuti`
                        } else if (minutes === 0) {
                            duration = `${wholeHours} ore`
                        } else if (wholeHours === 1) {
                            duration = `1 ora e ${minutes} minuti`
                        } else {
                            duration = `${wholeHours} ore e ${minutes} minuti`
                        }
                    }
                    periodDisplay = `${request.start_date} dalle ${request.start_time} alle ${request.end_time}`
                } else if (request.days) {
                    // Giorni interi
                    const totalHours = request.days * 8
                    duration = `${request.days} giorni (${totalHours} ore)`
                    periodDisplay = `${request.start_date} ➔ ${request.end_date}`
                } else if (request.hours) {
                    // Solo ore (vecchio formato)
                    duration = `${request.hours} ore`
                    periodDisplay = `${request.start_date} ➔ ${request.end_date}`
                } else {
                    duration = 'N/A'
                    periodDisplay = `${request.start_date} ➔ ${request.end_date}`
                }
            }

            html += `
                <div class="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-3">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center mb-2">
                                <span class="text-2xl mr-2">👤</span>
                                <div>
                                    <p class="font-bold text-gray-900">${employeeName}</p>
                                    <p class="text-sm text-gray-600">${employeeEmail}</p>
                                </div>
                            </div>
                            
                            <div class="bg-white rounded p-3 mb-3">
                                <p class="text-sm">
                                    <span class="font-semibold">📋 Tipo:</span> 
                                    <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs ml-1">
                                        ${request.type.toUpperCase()}
                                    </span>
                                </p>
                                <p class="text-sm mt-1">
                                    <span class="font-semibold">📅 Periodo:</span> 
                                    ${periodDisplay}
                                </p>
                                <p class="text-sm mt-1">
                                    <span class="font-semibold">⏱️ Durata:</span> 
                                    ${duration}
                                </p>
                                ${request.reason ? `
                                    <p class="text-sm mt-1">
                                        <span class="font-semibold">💬 Motivo:</span> 
                                        ${request.reason}
                                    </p>
                                ` : ''}
                                <p class="text-xs text-gray-400 mt-2">
                                    📅 Richiesta del: ${new Date(request.created_at).toLocaleDateString('it-IT')}
                                </p>
                            </div>
                        </div>
                        
                        <div class="flex flex-col space-y-2 ml-4">
                            <button 
                                onclick="approveRequest('${request.id}')"
                                class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                            >
                                ✅ Approva
                            </button>
                            <button 
                                onclick="rejectRequest('${request.id}')"
                                class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                            >
                                ❌ Rifiuta
                            </button>
                        </div>
                    </div>
                </div>
            `
        }
        
        container.innerHTML = html

    } catch (error) {
        console.error('❌ Error loading pending requests:', error)
        const container = document.getElementById('recentRequests')
        if (container) {
            container.innerHTML = `
                <div class="text-red-500 text-center py-4">
                    ❌ Errore nel caricamento delle richieste<br>
                    <small>${error.message}</small>
                </div>
            `
        }
    }
}
async function loadStats() {
    try {
        // Monthly approved requests
        const currentMonth = new Date().getMonth() + 1
        const currentYear = new Date().getFullYear()
        
        const { data: monthlyApproved } = await window.supabaseClient
            .from('requests')
            .select('id')
            .eq('status', 'approved')
            .gte('approved_at', `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`)

        // Upcoming leaves (next 30 days)
        const today = new Date()
        const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000))
        
        const { data: upcomingLeaves } = await window.supabaseClient
            .from('requests')
            .select('id')
            .eq('status', 'approved')
            .gte('start_date', today.toISOString().split('T')[0])
            .lte('start_date', thirtyDaysFromNow.toISOString().split('T')[0])

        // Update stats
        const monthlyElement = document.getElementById('monthlyApproved')
        const upcomingElement = document.getElementById('upcomingLeaves')
        
        if (monthlyElement) monthlyElement.textContent = monthlyApproved?.length || 0
        if (upcomingElement) upcomingElement.textContent = upcomingLeaves?.length || 0

    } catch (error) {
        console.error('Error loading stats:', error)
    }
}

// Approve request function
// Approve request function CORRETTA
async function approveRequest(requestId) {
    if (!confirm('🤔 Sei sicuro di voler approvare questa richiesta?')) return
    
    try {
        window.utils.showLoading()
        
        // Prima ottieni i dettagli della richiesta
        const { data: request, error: requestError } = await window.supabaseClient
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .single()

        if (requestError) throw requestError
        
        console.log('📋 Richiesta da approvare:', request)

        // Approva la richiesta
        const { error: updateError } = await window.supabaseClient
            .from('requests')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString()
            })
            .eq('id', requestId)

        if (updateError) throw updateError

        // **NUOVO: Aggiorna il bilancio del dipendente**
        await updateEmployeeBalance(request)

        window.utils.showToast('✅ Richiesta approvata con successo!', 'success')
        
        // Reload data
        await loadPendingRequests()
        await loadStats()

    } catch (error) {
        console.error('Error approving request:', error)
        window.utils.showToast('❌ Errore nell\'approvazione della richiesta', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Funzione updateEmployeeBalance CORRETTA
// Versione aggiornata di updateEmployeeBalance che considera orari variabili
async function updateEmployeeBalance(request) {
    try {
        const currentYear = new Date().getFullYear()
        
        console.log('💰 Aggiornando bilancio per:', request.employee_id, request.type)
        
        // Ottieni bilancio attuale
        const { data: balance, error: balanceError } = await window.supabaseClient
            .from('employee_balances')
            .select('*')
            .eq('employee_id', request.employee_id)
            .eq('year', currentYear)
            .single()

        if (balanceError) {
            console.error('Errore nel recupero bilancio:', balanceError)
            return
        }

        console.log('📊 Bilancio attuale:', balance)

        // Calcola nuovi valori in base al tipo di richiesta
        let updateData = {}
        
        switch (request.type) {
            case 'ferie':
                // Per le ferie, dobbiamo calcolare i giorni effettivi considerando:
                // - Giorni festivi (non contano)
                // - Chiusure aziendali (potrebbero contare)
                // - Solo giorni lavorativi
                if (window.holidayUtils && window.holidayUtils.calculateWorkingHours) {
                    const { totalDays } = await window.holidayUtils.calculateWorkingHours(
                        request.start_date, 
                        request.end_date
                    )
                    updateData.ferie_godute = balance.ferie_godute + totalDays
                    console.log(`🏖️ Ferie: ${balance.ferie_godute} + ${totalDays} giorni lavorativi = ${updateData.ferie_godute}`)
                } else {
                    // Fallback al calcolo standard
                    updateData.ferie_godute = balance.ferie_godute + (request.days || 0)
                    console.log(`🏖️ Ferie: ${balance.ferie_godute} + ${request.days} = ${updateData.ferie_godute}`)
                }
                break
                
            case 'rol':
            case 'ex_festivita':
                // Per ROL/Ex-festività, calcola le ore considerando gli orari variabili
                let hoursToDeduct = 0
                
                if (request.hours && request.start_time && request.end_time) {
                    // Permesso orario: usa le ore specificate
                    hoursToDeduct = request.hours
                } else if (request.days) {
                    // Giorni interi: calcola ore effettive basate sul calendario
                    if (window.holidayUtils && window.holidayUtils.calculateWorkingHours) {
                        const { totalHours } = await window.holidayUtils.calculateWorkingHours(
                            request.start_date, 
                            request.end_date
                        )
                        hoursToDeduct = totalHours
                        console.log(`📅 Calcolate ${totalHours} ore lavorative per il periodo`)
                    } else {
                        // Fallback: 8 ore per giorno
                        hoursToDeduct = request.days * 8
                    }
                }
                
                if (request.type === 'rol') {
                    updateData.rol_godute = balance.rol_godute + hoursToDeduct
                    console.log(`⏰ ROL: ${balance.rol_godute} + ${hoursToDeduct} ore = ${updateData.rol_godute}`)
                } else {
                    updateData.ex_festivita_godute = balance.ex_festivita_godute + hoursToDeduct
                    console.log(`🎉 Ex-fest: ${balance.ex_festivita_godute} + ${hoursToDeduct} ore = ${updateData.ex_festivita_godute}`)
                }
                break
                
            case 'malattia':
                // La malattia non scala dai contatori ferie/ROL
                console.log('🤒 Malattia approvata - nessun aggiornamento bilancio')
                return
                
            default:
                console.log('❓ Tipo sconosciuto:', request.type)
                return
        }

        // Aggiorna il bilancio nel database
        const { error: updateBalanceError } = await window.supabaseClient
            .from('employee_balances')
            .update(updateData)
            .eq('employee_id', request.employee_id)
            .eq('year', currentYear)

        if (updateBalanceError) {
            console.error('Errore aggiornamento bilancio:', updateBalanceError)
            throw updateBalanceError
        }

        console.log('✅ Bilancio aggiornato con successo!')

    } catch (error) {
        console.error('Errore nella funzione updateEmployeeBalance:', error)
        // Non fermare l'approvazione per errori nel bilancio
    }
}
// Reject request function CON MOTIVO
async function rejectRequest(requestId) {
    // Chiedi il motivo del rifiuto
    const reason = prompt('💬 Motivo del rifiuto (opzionale):')
    
    // Se l'utente clicca "Annulla", esce
    if (reason === null) {
        console.log('❌ Utente ha annullato il rifiuto')
        return
    }
    
    // Conferma finale
    if (!confirm('❌ Sei sicuro di voler rifiutare questa richiesta?')) return
    
    try {
        window.utils.showLoading()
        
        console.log('🔍 Rifiutando richiesta:', requestId, 'con motivo:', reason)
        
        // Prepara i dati di aggiornamento
        const updateData = {
            status: 'rejected'
        }
        
        // Aggiungi il motivo solo se fornito
        if (reason && reason.trim()) {
            updateData.rejection_reason = reason.trim()
        }
        
        const { data, error } = await window.supabaseClient
            .from('requests')
            .update(updateData)
            .eq('id', requestId)
            .select()

        console.log('📊 Risultato reject:', { data, error })

        if (error) throw error

        // Messaggio di successo personalizzato
        const successMsg = reason && reason.trim() 
            ? `❌ Richiesta rifiutata. Motivo: "${reason.trim()}"` 
            : '❌ Richiesta rifiutata'
            
        window.utils.showToast(successMsg, 'success')
        
        // Reload data
        await loadPendingRequests()
        await loadStats()

    } catch (error) {
        console.error('❌ Error rejecting request:', error)
        window.utils.showToast(`Errore nel rifiuto: ${error.message}`, 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Make functions global for onclick handlers
window.approveRequest = approveRequest
window.rejectRequest = rejectRequest