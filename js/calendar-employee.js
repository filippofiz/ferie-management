// Variabili globali
let currentDate = new Date()
let specialDays = []
let workSchedules = []
window.allRequests = []
window.myRequests = []
window.currentUserId = null

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Calendar Employee inizializzato')
    
    // Check authentication
    const session = await window.utils.checkAuth()
    if (!session) {
        window.location.href = 'index.html'
        return
    }

    currentUserId = session.user.id
    console.log('👤 User ID:', currentUserId)

    // Initialize calendar
    await loadCalendarData()
    renderCalendar()
    
    window.utils.hideLoading()
})

// Funzione helper per creare date corrette (evita problemi timezone)
function createLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Funzione helper per formattare date in formato YYYY-MM-DD
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Carica dati calendario
async function loadCalendarData() {
    console.log('📊 LoadCalendarData iniziato...')
    
    try {
        // 1. Carica giorni speciali
        console.log('1️⃣ Caricando giorni speciali...')
        const { data: specialDaysData, error: specialError } = await window.supabaseClient
            .from('special_days')
            .select('*')
            .order('date', { ascending: true })

        if (specialError) {
            console.error('❌ Errore giorni speciali:', specialError)
        } else {
            console.log('✅ Giorni speciali caricati:', specialDaysData?.length || 0)
        }
        specialDays = specialDaysData || []

        // 2. Carica configurazioni orari
        console.log('2️⃣ Caricando configurazioni orari...')
        const { data: schedulesData, error: scheduleError } = await window.supabaseClient
            .from('work_schedules')
            .select('*')
            .order('start_date', { ascending: true })

        if (scheduleError) {
            console.error('❌ Errore configurazioni:', scheduleError)
        } else {
            console.log('✅ Configurazioni caricate:', schedulesData?.length || 0)
        }
        workSchedules = schedulesData || []

        // 3. Carica le richieste approvate con JOIN dei profili
        console.log('3️⃣ Caricando richieste approvate con profili...')
        
        const { data: requestsWithProfiles, error: requestsError } = await window.supabaseClient
            .from('requests')
            .select(`
                *,
                profiles!employee_id (
                    id,
                    full_name,
                    email,
                    department
                )
            `)
            .eq('status', 'approved')
            .order('start_date', { ascending: true })
        
        if (requestsError) {
            console.error('❌ Errore caricamento richieste:', requestsError)
            
            // Fallback: prova a caricare richieste e profili separatamente
            console.log('🔄 Tentativo fallback: caricamento separato...')
            
            const { data: simpleRequests, error: simpleError } = await window.supabaseClient
                .from('requests')
                .select('*')
                .eq('status', 'approved')
                .order('start_date', { ascending: true })
            
            if (simpleError) {
                console.error('❌ Anche il fallback è fallito:', simpleError)
                window.allRequests = []
            } else {
                console.log('✅ Richieste caricate (senza profili):', simpleRequests?.length || 0)
                
                // Carica profili separatamente
                if (simpleRequests && simpleRequests.length > 0) {
                    const profileIds = [...new Set(simpleRequests.map(r => r.employee_id))]
                    const { data: profilesData } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, email, department')
                        .in('id', profileIds)
                    
                    const profilesMap = {}
                    if (profilesData) {
                        profilesData.forEach(p => {
                            profilesMap[p.id] = p
                        })
                    }
                    
                    // Aggiungi profili alle richieste
                    window.allRequests = simpleRequests.map(req => ({
                        ...req,
                        profiles: profilesMap[req.employee_id] || {
                            full_name: 'Utente sconosciuto',
                            email: '',
                            department: ''
                        }
                    }))
                }
            }
        } else {
            console.log('✅ Richieste con profili caricate:', requestsWithProfiles?.length || 0)
            window.allRequests = requestsWithProfiles || []
            
            // Debug: mostra prima richiesta
            if (window.allRequests.length > 0) {
                console.log('📋 Esempio prima richiesta:', window.allRequests[0])
            }
        }
        
        // 4. Debug: mostra TUTTE le richieste caricate
        console.log('🔍 DEBUG - Tutte le richieste caricate:')
        window.allRequests.forEach((req, index) => {
            const profileName = req.profiles?.full_name || 'Sconosciuto'
            console.log(`${index + 1}. ${profileName}: ${req.type} | ${req.start_date} → ${req.end_date} | Status: ${req.status}`)
        })
        
        // 5. Filtra per il mese corrente
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        const startDateStr = formatDateString(startOfMonth)
        const endDateStr = formatDateString(endOfMonth)
        
        console.log('📅 Filtrando per il periodo:', startDateStr, '-', endDateStr)
        
        const filteredRequests = window.allRequests.filter(req => {
            if (!req.start_date || !req.end_date) {
                console.log('⚠️ Richiesta senza date:', req.id)
                return false
            }
            
            // Controlla se la richiesta si sovrappone con il mese corrente
            const overlaps = req.end_date >= startDateStr && req.start_date <= endDateStr
            
            if (overlaps) {
                console.log(`✅ Richiesta ${req.id} inclusa: ${req.start_date} - ${req.end_date}`)
            }
            
            return overlaps
        })
        
        window.allRequests = filteredRequests
        
        console.log('📊 Richieste filtrate per il mese corrente:', window.allRequests.length)
        
        // 6. Separa le richieste dell'utente corrente
        myRequests = window.allRequests.filter(req => req.employee_id === currentUserId)
        
        console.log('📊 Riepilogo finale:')
        console.log('- Totale richieste nel mese:', window.allRequests.length)
        console.log('- Le mie richieste:', myRequests.length)
        console.log('- Richieste colleghi:', window.allRequests.length - myRequests.length)

        // 7. Aggiorna info orario corrente
        updateCurrentScheduleInfo()

    } catch (error) {
        console.error('❌ Errore generale in loadCalendarData:', error)
        window.utils.showToast('Errore nel caricamento dei dati', 'error')
    }
    
    console.log('✅ LoadCalendarData completato')
}

// Render calendario
function renderCalendar() {
    console.log('🎨 Inizio rendering calendario...')
    
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // Aggiorna header
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                       'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
    document.getElementById('currentMonthYear').textContent = `${monthNames[month]} ${year}`
    
    // Calcola giorni del mese
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // Calcola offset per il primo giorno (0 = domenica, ma vogliamo 0 = lunedì)
    let firstDayOfWeek = firstDay.getDay() - 1
    if (firstDayOfWeek < 0) firstDayOfWeek = 6
    
    // Genera griglia calendario
    const calendar = document.getElementById('calendar')
    // Mantieni header giorni settimana
    calendar.innerHTML = `
        <div class="text-center font-semibold p-2 text-gray-700">Lunedì</div>
        <div class="text-center font-semibold p-2 text-gray-700">Martedì</div>
        <div class="text-center font-semibold p-2 text-gray-700">Mercoledì</div>
        <div class="text-center font-semibold p-2 text-gray-700">Giovedì</div>
        <div class="text-center font-semibold p-2 text-gray-700">Venerdì</div>
        <div class="text-center font-semibold p-2 text-gray-700">Sabato</div>
        <div class="text-center font-semibold p-2 text-gray-700">Domenica</div>
    `
    
    // Aggiungi giorni vuoti prima del primo giorno
    for (let i = 0; i < firstDayOfWeek; i++) {
        calendar.innerHTML += '<div class="border border-gray-200"></div>'
    }
    
    // Aggiungi giorni del mese
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day)
        const dateStr = formatDateString(date)
        const dayOfWeek = date.getDay()
        
        // Debug per alcuni giorni
        if (day === 1 || day === 15) {
            console.log(`🗓️ Controllo giorno ${dateStr}:`)
        }
        
        // Trova eventi per questo giorno
        const specialDay = specialDays.find(sd => sd.date === dateStr)
        
        // Filtra richieste per questo giorno
        const dayRequests = window.allRequests.filter(req => {
            if (!req.start_date || !req.end_date) return false
            
            const inRange = dateStr >= req.start_date && dateStr <= req.end_date
            
            // Debug dettagliato per il primo giorno
            if (day === 1 && inRange) {
                console.log(`  ✅ Richiesta trovata per ${dateStr}:`, req.profiles?.full_name, req.type)
            }
            
            return inRange
        })
        
        if (day === 1 || day === 15) {
            console.log(`  📊 Richieste per questo giorno: ${dayRequests.length}`)
        }
        
        // Separa le tue richieste da quelle dei colleghi
        const myDayRequests = dayRequests.filter(req => req.employee_id === currentUserId)
        const colleagueRequests = dayRequests.filter(req => req.employee_id !== currentUserId)
        
        // Determina colore sfondo
        let bgColor = ''
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            bgColor = 'bg-gray-100' // Weekend
        }
        if (specialDay) {
            if (specialDay.type === 'holiday') {
                bgColor = 'bg-red-100'
            } else if (specialDay.type === 'company_closure') {
                bgColor = 'bg-orange-100'
            }
        }
        
        // Controlla se è oggi
        const isToday = date.toDateString() === new Date().toDateString()
        
        calendar.innerHTML += `
            <div class="calendar-day border border-gray-200 p-2 ${bgColor} ${isToday ? 'ring-2 ring-blue-500' : ''} hover:bg-gray-50 cursor-pointer" 
                 onclick="openDayModal('${dateStr}')">
                <div class="font-semibold text-sm ${isToday ? 'text-blue-600' : ''}">${day}</div>
                
                ${specialDay ? `
                    <div class="text-xs mt-1 ${specialDay.type === 'holiday' ? 'text-red-600' : 'text-orange-600'}">
                        ${specialDay.name}
                    </div>
                ` : ''}
                
                ${myDayRequests.length > 0 ? `
                    <div class="text-xs bg-purple-200 text-purple-800 rounded px-1 mt-1">
                        Tu: ${myDayRequests[0].type === 'ferie' ? 'Ferie' : 
                             myDayRequests[0].type === 'malattia' ? 'Malattia' :
                             myDayRequests[0].type.toUpperCase()}
                    </div>
                ` : ''}
                
                ${colleagueRequests.length > 0 ? `
                    <div class="mt-1 space-y-1">
                        ${colleagueRequests.slice(0, 2).map(req => {
                            const fullName = req.profiles?.full_name || 'Utente';
                            const typeColor = req.type === 'ferie' ? 'bg-blue-200' : 
                                            req.type === 'malattia' ? 'bg-yellow-200' : 'bg-green-200';
                            return `
                                <div class="text-xs ${typeColor} rounded px-1 truncate" 
                                     title="${fullName} - ${req.type}">
                                    ${fullName.split(' ')[0]}
                                </div>
                            `;
                        }).join('')}
                        ${colleagueRequests.length > 2 ? `
                            <div class="text-xs text-gray-500">+${colleagueRequests.length - 2} altri</div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `
    }
    
    console.log('✅ Rendering calendario completato')
}

// Apri modal giorno
async function openDayModal(dateStr) {
    console.log('🔍 Apertura modal per:', dateStr)
    
    const date = new Date(dateStr)
    const dayOfWeek = date.getDay()
    
    // Trova dati del giorno
    const specialDay = specialDays.find(sd => sd.date === dateStr)
    
    // Filtra richieste per questo giorno
    const dayRequests = window.allRequests.filter(req => {
        if (!req.start_date || !req.end_date) return false
        return dateStr >= req.start_date && dateStr <= req.end_date
    })
    
    console.log(`📊 Richieste per ${dateStr}: ${dayRequests.length}`)
    
    // Separa richieste
    const myDayRequests = dayRequests.filter(req => req.employee_id === currentUserId)
    const colleagueRequests = dayRequests.filter(req => req.employee_id !== currentUserId)
    
    // Trova orario di lavoro per questa data
    const schedule = workSchedules.find(ws => 
        dateStr >= ws.start_date && dateStr <= ws.end_date
    )
    
    // Calcola ore lavorative del giorno
    let workHours = 0
    if (schedule) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        workHours = schedule[`${dayNames[dayOfWeek]}_hours`] || 0
    }
    
    // Formatta data
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    document.getElementById('modalDate').textContent = date.toLocaleDateString('it-IT', options)
    
    // Genera contenuto modal
    let content = `
        <div class="space-y-4">
            <!-- Info Giorno -->
            <div class="bg-gray-50 rounded p-3">
                <p class="text-sm">
                    <span class="font-semibold">Ore lavorative:</span> 
                    ${workHours > 0 ? `${workHours} ore` : 'Giorno non lavorativo'}
                </p>
                ${schedule ? `
                    <p class="text-xs text-gray-500 mt-1">
                        Configurazione: ${schedule.name}
                    </p>
                ` : ''}
            </div>
            
            <!-- Giorno Speciale -->
            ${specialDay ? `
                <div class="bg-${specialDay.type === 'holiday' ? 'red' : 'orange'}-50 rounded p-3">
                    <h4 class="font-semibold text-sm mb-1">
                        ${specialDay.type === 'holiday' ? '🎊 Festività' : '🏢 Chiusura Aziendale'}
                    </h4>
                    <p class="text-sm">${specialDay.name}</p>
                    ${specialDay.description ? `<p class="text-xs text-gray-600 mt-1">${specialDay.description}</p>` : ''}
                    ${specialDay.counts_as_vacation ? `
                        <p class="text-xs text-orange-600 mt-1">⚠️ Conta come giorno di ferie</p>
                    ` : ''}
                </div>
            ` : ''}
            
            <!-- Le Tue Assenze -->
            ${myDayRequests.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-sm mb-2">🟣 Le Tue Assenze</h4>
                    <div class="space-y-2">
                        ${myDayRequests.map(req => `
                            <div class="bg-purple-50 rounded p-2">
                                <p class="text-sm font-medium text-purple-800">
                                    ${req.type === 'ferie' ? '🏖️ Ferie' : 
                                      req.type === 'rol' ? '⏰ ROL' :
                                      req.type === 'ex_festivita' ? '🎉 Ex-Festività' : 
                                      req.type === 'malattia' ? '🤒 Malattia' : req.type.toUpperCase()}
                                </p>
                                <p class="text-xs text-gray-600">
                                    ${req.start_date === req.end_date ? 
                                        (req.start_time && req.end_time ? 
                                            `dalle ${req.start_time} alle ${req.end_time}` : 
                                            'Tutto il giorno'
                                        ) : 
                                        `Dal ${req.start_date} al ${req.end_date}`
                                    }
                                </p>
                                ${req.reason ? `<p class="text-xs text-gray-500 mt-1">Motivo: ${req.reason}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Colleghi Assenti -->
            ${colleagueRequests.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-sm mb-2">👥 Colleghi Assenti (${colleagueRequests.length})</h4>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        ${colleagueRequests.map(req => `
                            <div class="bg-${req.type === 'ferie' ? 'blue' : 
                                           req.type === 'malattia' ? 'yellow' : 'green'}-50 rounded p-2">
                                <p class="text-sm font-medium">${req.profiles?.full_name || 'Utente'}</p>
                                <p class="text-xs text-gray-500">${req.profiles?.department || 'Reparto non specificato'}</p>
                                <p class="text-xs text-gray-600">
                                    ${req.type === 'ferie' ? '🏖️ Ferie' : 
                                      req.type === 'malattia' ? '🤒 Malattia' :
                                      req.type.toUpperCase()} - 
                                    ${req.start_date === req.end_date ? 
                                        (req.start_time && req.end_time ? 
                                            `dalle ${req.start_time} alle ${req.end_time}` : 
                                            'Tutto il giorno'
                                        ) : 
                                        `Dal ${req.start_date} al ${req.end_date}`
                                    }
                                </p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Se nessuno è assente -->
            ${dayRequests.length === 0 && !specialDay ? `
                <div class="text-center text-gray-500 text-sm py-4">
                    Nessuna assenza programmata per questo giorno
                </div>
            ` : ''}
            
            <!-- Pulsanti -->
            <div class="flex justify-end pt-4 border-t">
                <button onclick="closeDayModal()" 
                        class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                    Chiudi
                </button>
            </div>
        </div>
    `
    
    document.getElementById('modalContent').innerHTML = content
    document.getElementById('dayModal').classList.remove('hidden')
}

// Chiudi modal giorno
function closeDayModal() {
    document.getElementById('dayModal').classList.add('hidden')
}

// Navigazione calendario
function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1)
    loadCalendarData().then(() => renderCalendar())
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1)
    loadCalendarData().then(() => renderCalendar())
}

function todayView() {
    currentDate = new Date()
    loadCalendarData().then(() => renderCalendar())
}

// Aggiorna info orario corrente
function updateCurrentScheduleInfo() {
    const today = formatDateString(new Date())
    const currentSchedule = workSchedules.find(ws => 
        today >= ws.start_date && today <= ws.end_date
    )
    
    const infoDiv = document.getElementById('currentScheduleInfo')
    
    if (currentSchedule) {
        infoDiv.innerHTML = `
            <p class="font-medium">${currentSchedule.name}</p>
            <p>Periodo: ${currentSchedule.start_date} - ${currentSchedule.end_date}</p>
            <div class="grid grid-cols-7 gap-2 mt-2">
                <div>Lun: ${currentSchedule.monday_hours}h</div>
                <div>Mar: ${currentSchedule.tuesday_hours}h</div>
                <div>Mer: ${currentSchedule.wednesday_hours}h</div>
                <div>Gio: ${currentSchedule.thursday_hours}h</div>
                <div>Ven: ${currentSchedule.friday_hours}h</div>
                <div>Sab: ${currentSchedule.saturday_hours}h</div>
                <div>Dom: ${currentSchedule.sunday_hours}h</div>
            </div>
            <p class="mt-2 text-blue-600">Totale settimanale: ${currentSchedule.total_weekly_hours} ore</p>
        `
    } else {
        infoDiv.innerHTML = '<p class="text-red-600">⚠️ Nessuna configurazione orari attiva per oggi</p>'
    }
}

// Rendi funzioni globali
window.previousMonth = previousMonth
window.nextMonth = nextMonth
window.todayView = todayView
window.openDayModal = openDayModal
window.closeDayModal = closeDayModal