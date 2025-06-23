document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await window.utils.checkAuth()
    if (!session) {
        window.location.href = 'index.html'
        return
    }

    // Load user data
    await loadUserData(session.user.id)
    
    // Hide loading
    window.utils.hideLoading()
})

// Variabile globale per il balance
let currentBalance = null

async function loadUserData(userId) {
    try {
        // Get user profile
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (profileError) throw profileError

        // Update UI with user info
        document.getElementById('userName').textContent = profile.full_name
        document.getElementById('welcomeMessage').textContent = `Benvenuto, ${profile.full_name}!`
        document.getElementById('employeeInfo').textContent = `${profile.department} • ${profile.contract_type === 'full_time' ? 'Tempo pieno' : 'Part-time'}`
        
        if (profile.role === 'admin') {
            document.getElementById('userRole').textContent = 'Admin'
            document.getElementById('userRole').className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs'
        }

        // Get balance for current year
        await loadBalance(userId)
        
        // Load requests stats
        await loadRequestsStats(userId)

        // Setup new request button DOPO aver caricato i dati
        setupNewRequestButton()

    } catch (error) {
        console.error('Error loading user data:', error)
        window.utils.showToast('Errore nel caricamento dei dati', 'error')
    }
}

async function loadBalance(userId) {
    try {
        const currentYear = new Date().getFullYear()
        
        let { data: balance, error } = await window.supabaseClient
            .from('employee_balances')
            .select('*')
            .eq('employee_id', userId)
            .eq('year', currentYear)
            .single()

        // Create balance if doesn't exist
        if (error && error.code === 'PGRST116') {
            const { data: newBalance, error: createError } = await window.supabaseClient
                .from('employee_balances')
                .insert([{
                    employee_id: userId,
                    year: currentYear
                }])
                .select()
                .single()

            if (createError) throw createError
            balance = newBalance
        } else if (error) {
            throw error
        }

        // IMPORTANTE: Salva il balance globalmente
        currentBalance = balance

        // Update balance cards
        document.getElementById('ferieBalance').textContent = `${balance.ferie_residue}/${balance.ferie_totali}`
        document.getElementById('rolBalance').textContent = `${balance.rol_residue}/${balance.rol_totali}`
        document.getElementById('exFestBalance').textContent = `${balance.ex_festivita_residue}/${balance.ex_festivita_totali}`

    } catch (error) {
        console.error('Error loading balance:', error)
        window.utils.showToast('Errore nel caricamento del bilancio', 'error')
    }
}

async function loadRequestsStats(userId) {
    try {
        // Query completa per ottenere tutte le richieste
        const { data: requests, error } = await window.supabaseClient
            .from('requests')
            .select('*')
            .eq('employee_id', userId)
            .order('created_at', { ascending: false })

        if (error) throw error

        // Count by status
        const stats = {
            pending: 0,
            approved: 0,
            rejected: 0
        }

        requests.forEach(request => {
            if (stats.hasOwnProperty(request.status)) {
                stats[request.status]++
            }
        })

        // Update stats cards
        document.getElementById('pendingCount').textContent = stats.pending
        document.getElementById('approvedCount').textContent = stats.approved
        document.getElementById('rejectedCount').textContent = stats.rejected

        // **NUOVO: Mostra le richieste recenti**
        displayRecentRequests(requests.slice(0, 5)) // Mostra solo le ultime 5

    } catch (error) {
        console.error('Error loading requests stats:', error)
    }
}

// **NUOVA FUNZIONE: Mostra richieste recenti**
function displayRecentRequests(requests) {
    const container = document.getElementById('recentRequests')
    if (!container) {
        // Se il container non esiste, crealo nell'overview tab
        const overviewTab = document.getElementById('overviewTab')
        if (overviewTab) {
            const recentSection = document.createElement('div')
            recentSection.innerHTML = `
                <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-4">📋 Le Mie Richieste Recenti</h3>
                    <div id="recentRequests" class="space-y-3"></div>
                </div>
            `
            overviewTab.appendChild(recentSection)
        } else {
            return // Se non c'è nemmeno overviewTab, esci
        }
    }

    const recentContainer = document.getElementById('recentRequests')
    if (!recentContainer) return

    if (requests.length === 0) {
        recentContainer.innerHTML = '<div class="text-gray-500 text-center py-4">📝 Nessuna richiesta presente</div>'
        return
    }

    recentContainer.innerHTML = requests.map(request => {
        // Determina colore e icona per stato
        let statusColor, statusIcon, statusText
        switch (request.status) {
            case 'pending':
                statusColor = 'bg-yellow-100 text-yellow-800'
                statusIcon = '⏳'
                statusText = 'In Attesa'
                break
            case 'approved':
                statusColor = 'bg-green-100 text-green-800'
                statusIcon = '✅'
                statusText = 'Approvata'
                break
            case 'rejected':
                statusColor = 'bg-red-100 text-red-800'
                statusIcon = '❌'
                statusText = 'Rifiutata'
                break
            default:
                statusColor = 'bg-gray-100 text-gray-800'
                statusIcon = '❓'
                statusText = request.status
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

        return `
            <div class="bg-gray-50 rounded-lg p-4 border-l-4 ${
                request.status === 'approved' ? 'border-green-500' :
                request.status === 'rejected' ? 'border-red-500' :
                'border-yellow-500'
            }">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center mb-2">
                            <span class="text-lg mr-2">${statusIcon}</span>
                            <div>
                                <p class="font-medium text-gray-900">
                                    ${request.type.toUpperCase()} - ${statusText}
                                </p>
                                <p class="text-sm text-gray-600">
                                    📅 ${periodDisplay} (${duration})
                                </p>
                            </div>
                        </div>
                        
                        ${request.reason ? `
                            <p class="text-sm text-gray-600 bg-white rounded p-2 mb-2">
                                <span class="font-semibold">💬 Motivo:</span> ${request.reason}
                            </p>
                        ` : ''}
                        
                        ${request.status === 'rejected' && request.rejection_reason ? `
                            <p class="text-sm text-red-600 bg-red-50 rounded p-2 mb-2">
                                <span class="font-semibold">❌ Motivo rifiuto:</span> ${request.rejection_reason}
                            </p>
                        ` : ''}
                        
                        <p class="text-xs text-gray-400">
                            📅 Richiesta del: ${new Date(request.created_at).toLocaleDateString('it-IT', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                        
                        ${request.approved_at ? `
                            <p class="text-xs text-green-600">
                                ✅ Approvata il: ${new Date(request.approved_at).toLocaleDateString('it-IT', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </p>
                        ` : ''}
                    </div>
                    
                    <span class="${statusColor} px-3 py-1 rounded-full text-xs font-medium">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
            </div>
        `
    }).join('')
}
// Setup del pulsante nuova richiesta
function setupNewRequestButton() {
    const newRequestBtn = document.getElementById('newRequestBtn')
    if (newRequestBtn) {
        newRequestBtn.addEventListener('click', () => {
            if (currentBalance) {
                // Per ora mostriamo un alert, poi aggiungeremo il form
                showSimpleRequestForm()
            } else {
                window.utils.showToast('Caricamento dati in corso...', 'warning')
            }
        })
    }
}

// Form richiesta semplificato
// Sostituisci TUTTA la funzione showSimpleRequestForm con questa versione completa:

function showSimpleRequestForm() {
    const modalHTML = `
        <div id="requestModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-900">📝 Nuova Richiesta</h2>
                    <button onclick="closeRequestModal()" class="text-gray-400 hover:text-gray-600 text-2xl">
                        ✕
                    </button>
                </div>

                <form id="simpleRequestForm" class="space-y-4">
                    <!-- Tipo -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            🎯 Tipo di Richiesta
                        </label>
                        <select id="requestType" onchange="updateFormFields()" class="w-full border border-gray-300 rounded-md px-3 py-2">
                            <option value="ferie">🏖️ Ferie (${currentBalance?.ferie_residue || 0} giorni disponibili)</option>
                            <option value="rol">⏰ ROL (${currentBalance?.rol_residue || 0} ore disponibili)</option>
                            <option value="ex_festivita">🎉 Ex-Festività (${currentBalance?.ex_festivita_residue || 0} ore disponibili)</option>
                            <option value="malattia">🤒 Malattia</option>
                        </select>
                    </div>

                    <!-- Opzioni durata (solo per ROL/Ex-festività) -->
                    <div id="durationOptions" class="hidden">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            ⏱️ Tipo di permesso
                        </label>
                        <div class="flex space-x-4">
                            <label class="flex items-center">
                                <input type="radio" name="duration_type" value="full_day" checked onchange="updateDateFields()">
                                <span class="ml-2">Giorno intero</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" name="duration_type" value="hours" onchange="updateDateFields()">
                                <span class="ml-2">Permesso orario</span>
                            </label>
                        </div>
                    </div>

                    <!-- Date per giorni interi -->
                    <div id="fullDayDates" class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">📅 Data Inizio</label>
                            <input type="date" id="startDate" min="${new Date().toISOString().split('T')[0]}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">📅 Data Fine</label>
                            <input type="date" id="endDate"
                                   class="w-full border border-gray-300 rounded-md px-3 py-2">
                        </div>
                    </div>

                    <!-- Sezione per permesso orario -->
                    <div id="hourlyPermission" class="hidden space-y-4">
                        <!-- Data singola -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">📅 Data del permesso</label>
                            <input type="date" id="permissionDate" min="${new Date().toISOString().split('T')[0]}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2">
                        </div>

                        <!-- Orari -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">🕐 Dalle ore</label>
                                <input type="time" id="startTime" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">🕐 Alle ore</label>
                                <input type="time" id="endTime" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2">
                            </div>
                        </div>

                        <!-- Ore calcolate -->
                        <div id="calculatedHours" class="bg-blue-50 rounded p-3 hidden">
                            <p class="text-sm text-blue-700">
                                <span class="font-semibold">⏱️ Ore totali:</span> 
                                <span id="totalHours">0</span> ore
                            </p>
                        </div>
                    </div>

                    <!-- Motivo -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">💬 Motivo</label>
                        <textarea id="requestReason" rows="3" placeholder="Motivo della richiesta..."
                                  class="w-full border border-gray-300 rounded-md px-3 py-2"></textarea>
                    </div>

                    <!-- Riepilogo dinamico -->
                    <div id="requestSummary" class="bg-gray-50 rounded p-3 hidden">
                        <h4 class="font-semibold text-sm mb-2">📊 Riepilogo richiesta:</h4>
                        <div id="summaryContent" class="text-sm text-gray-600"></div>
                    </div>

                    <!-- Buttons -->
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" onclick="closeRequestModal()" 
                                class="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                            Annulla
                        </button>
                        <button type="submit" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
                            🚀 Invia Richiesta
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHTML)
    
    // Setup form submit
    document.getElementById('simpleRequestForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        await submitRequest()
    })

    // Setup event listeners per calcolo ore
    document.getElementById('startTime').addEventListener('change', calculateHours)
    document.getElementById('endTime').addEventListener('change', calculateHours)
    document.getElementById('startDate').addEventListener('change', updateSummary)
    document.getElementById('endDate').addEventListener('change', updateSummary)
    document.getElementById('permissionDate').addEventListener('change', updateSummary)

    // Setup iniziale
    updateFormFields()
}

// Funzione per aggiornare i campi del form
function updateFormFields() {
    const type = document.getElementById('requestType').value
    const durationOptions = document.getElementById('durationOptions')
    
    if (type === 'rol' || type === 'ex_festivita') {
        durationOptions.classList.remove('hidden')
        updateDateFields()
    } else {
        durationOptions.classList.add('hidden')
        document.getElementById('hourlyPermission').classList.add('hidden')
        document.getElementById('fullDayDates').classList.remove('hidden')
    }
    updateSummary()
}

// Funzione per aggiornare i campi data/ore
function updateDateFields() {
    const durationType = document.querySelector('input[name="duration_type"]:checked')?.value
    const fullDayDates = document.getElementById('fullDayDates')
    const hourlyPermission = document.getElementById('hourlyPermission')
    
    if (durationType === 'hours') {
        fullDayDates.classList.add('hidden')
        hourlyPermission.classList.remove('hidden')
        // Imposta data permesso = data inizio se presente
        const startDate = document.getElementById('startDate').value
        if (startDate) {
            document.getElementById('permissionDate').value = startDate
        }
    } else {
        fullDayDates.classList.remove('hidden')
        hourlyPermission.classList.add('hidden')
    }
    updateSummary()
}

// Calcola ore basandosi su orario inizio/fine
function calculateHours() {
    const startTime = document.getElementById('startTime').value
    const endTime = document.getElementById('endTime').value
    
    if (startTime && endTime) {
        const start = new Date(`2000-01-01T${startTime}`)
        const end = new Date(`2000-01-01T${endTime}`)
        
        let diff = (end - start) / (1000 * 60 * 60) // differenza in ore
        
        if (diff < 0) {
            window.utils.showToast('L\'orario di fine deve essere dopo l\'orario di inizio', 'error')
            document.getElementById('endTime').value = ''
            return
        }
        
        if (diff > 8) {
            window.utils.showToast('Non puoi richiedere più di 8 ore di permesso al giorno', 'error')
            document.getElementById('endTime').value = ''
            return
        }
        
        document.getElementById('totalHours').textContent = diff.toFixed(1)
        document.getElementById('calculatedHours').classList.remove('hidden')
    } else {
        document.getElementById('calculatedHours').classList.add('hidden')
    }
    updateSummary()
}

// Aggiorna riepilogo
function updateSummary() {
    const type = document.getElementById('requestType').value
    const durationType = document.querySelector('input[name="duration_type"]:checked')?.value
    const summaryDiv = document.getElementById('requestSummary')
    const summaryContent = document.getElementById('summaryContent')
    
    let summary = ''
    
    if (type === 'ferie' || type === 'malattia') {
        const startDate = document.getElementById('startDate').value
        const endDate = document.getElementById('endDate').value
        if (startDate && endDate) {
            const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
            summary = `${type === 'ferie' ? 'Ferie' : 'Malattia'} dal ${new Date(startDate).toLocaleDateString('it-IT')} al ${new Date(endDate).toLocaleDateString('it-IT')} (${days} giorni)`
        }
    } else if ((type === 'rol' || type === 'ex_festivita') && durationType === 'hours') {
        const date = document.getElementById('permissionDate').value
        const startTime = document.getElementById('startTime').value
        const endTime = document.getElementById('endTime').value
        const totalHours = document.getElementById('totalHours').textContent
        
        if (date && startTime && endTime) {
            summary = `Permesso ${type.toUpperCase()} il ${new Date(date).toLocaleDateString('it-IT')} dalle ${startTime} alle ${endTime} (${totalHours} ore)`
        }
    } else if ((type === 'rol' || type === 'ex_festivita') && durationType === 'full_day') {
        const startDate = document.getElementById('startDate').value
        const endDate = document.getElementById('endDate').value
        if (startDate && endDate) {
            const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
            const totalHours = days * 8
            summary = `${type.toUpperCase()} dal ${new Date(startDate).toLocaleDateString('it-IT')} al ${new Date(endDate).toLocaleDateString('it-IT')} (${days} giorni = ${totalHours} ore)`
        }
    }
    
    if (summary) {
        summaryContent.textContent = summary
        summaryDiv.classList.remove('hidden')
    } else {
        summaryDiv.classList.add('hidden')
    }
}

// Sostituisci TUTTA la funzione submitRequest con questa versione corretta:

async function submitRequest() {
    try {
        const session = await window.utils.checkAuth()
        if (!session) {
            window.utils.showToast('Sessione scaduta', 'error')
            return
        }

        const type = document.getElementById('requestType').value
        const durationType = document.querySelector('input[name="duration_type"]:checked')?.value
        const reason = document.getElementById('requestReason').value

        window.utils.showLoading()

        let requestData = {
            employee_id: session.user.id,
            type: type,
            reason: reason || null,
            status: 'pending'
        }

        // Gestione in base al tipo di richiesta
        if (type === 'ferie' || type === 'malattia') {
            // Giorni interi
            requestData.start_date = document.getElementById('startDate').value
            requestData.end_date = document.getElementById('endDate').value
            
            if (!requestData.start_date || !requestData.end_date) {
                window.utils.showToast('Compila tutte le date richieste', 'error')
                window.utils.hideLoading()
                return
            }
            
            const start = new Date(requestData.start_date)
            const end = new Date(requestData.end_date)
            requestData.days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
            
        } else if ((type === 'rol' || type === 'ex_festivita') && durationType === 'hours') {
            // Permesso orario
            const permissionDate = document.getElementById('permissionDate').value
            const startTime = document.getElementById('startTime').value
            const endTime = document.getElementById('endTime').value
            
            if (!permissionDate || !startTime || !endTime) {
                window.utils.showToast('Compila tutti i campi richiesti', 'error')
                window.utils.hideLoading()
                return
            }
            
            requestData.start_date = permissionDate
            requestData.end_date = permissionDate
            requestData.start_time = startTime
            requestData.end_time = endTime
            
            // Calcola ore
            const start = new Date(`2000-01-01T${startTime}`)
            const end = new Date(`2000-01-01T${endTime}`)
            requestData.hours = (end - start) / (1000 * 60 * 60)
            
        } else {
            // ROL/Ex-festività giorni interi
            requestData.start_date = document.getElementById('startDate').value
            requestData.end_date = document.getElementById('endDate').value
            
            if (!requestData.start_date || !requestData.end_date) {
                window.utils.showToast('Compila tutte le date richieste', 'error')
                window.utils.hideLoading()
                return
            }
            
            const start = new Date(requestData.start_date)
            const end = new Date(requestData.end_date)
            requestData.days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        }

        // NON fare più validazione qui perché l'abbiamo già fatta sopra per ogni caso

        // Inserisci nel database
        const { error } = await window.supabaseClient
            .from('requests')
            .insert([requestData])

        if (error) throw error

        window.utils.showToast('✅ Richiesta inviata con successo!', 'success')
        closeRequestModal()
        
        // Ricarica stats
        await loadRequestsStats(session.user.id)

    } catch (error) {
        console.error('Errore invio richiesta:', error)
        window.utils.showToast('❌ Errore nell\'invio della richiesta', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Rendi funzioni globali
window.updateFormFields = updateFormFields
window.updateDateFields = updateDateFields
window.calculateHours = calculateHours
window.updateSummary = updateSummary

// Chiudi modal
function closeRequestModal() {
    const modal = document.getElementById('requestModal')
    if (modal) modal.remove()
}

// Rendi funzione globale
window.closeRequestModal = closeRequestModal