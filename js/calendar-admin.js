// Variabili globali
let currentDate = new Date()
let specialDays = []
let workSchedules = []
let approvedRequests = []

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
    try {
        // Carica giorni speciali
        const { data: specialDaysData } = await window.supabaseClient
            .from('special_days')
            .select('*')
            .order('date', { ascending: true })

        specialDays = specialDaysData || []

        // Carica configurazioni orari
        const { data: schedulesData } = await window.supabaseClient
            .from('work_schedules')
            .select('*')
            .order('start_date', { ascending: true })

        workSchedules = schedulesData || []

        // Carica richieste approvate per il mese corrente
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

        const { data: requestsData } = await window.supabaseClient
            .from('requests')
            .select(`
                *,
                profiles(full_name, email)
            `)
            .eq('status', 'approved')
            .gte('start_date', startOfMonth.toISOString().split('T')[0])
            .lte('end_date', endOfMonth.toISOString().split('T')[0])

        approvedRequests = requestsData || []

        // Aggiorna info orario corrente
        updateCurrentScheduleInfo()

    } catch (error) {
        console.error('Error loading calendar data:', error)
        window.utils.showToast('Errore nel caricamento dei dati', 'error')
    }
}

// Render calendario
function renderCalendar() {
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
        
        // Trova eventi per questo giorno
        const specialDay = specialDays.find(sd => sd.date === dateStr)
    const dayRequests = approvedRequests.filter(req => {
    const reqStart = createLocalDate(req.start_date)
    const reqEnd = createLocalDate(req.end_date)
    const currentDay = createLocalDate(dateStr)
    return currentDay >= reqStart && currentDay <= reqEnd
})
        
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
            <div class="calendar-day border border-gray-200 p-2 ${bgColor} ${isToday ? 'ring-2 ring-blue-500' : ''}" 
                 onclick="openDayModal('${dateStr}')">
                <div class="font-semibold text-sm ${isToday ? 'text-blue-600' : ''}">${day}</div>
                
                ${specialDay ? `
                    <div class="text-xs mt-1 ${specialDay.type === 'holiday' ? 'text-red-600' : 'text-orange-600'}">
                        ${specialDay.name}
                    </div>
                ` : ''}
                
                ${dayRequests.length > 0 ? `
                    <div class="mt-1 space-y-1">
                        ${dayRequests.slice(0, 3).map(req => `
                            <div class="text-xs ${req.type === 'ferie' ? 'bg-blue-200' : 'bg-green-200'} 
                                        rounded px-1 truncate" title="${req.profiles.full_name}">
                                ${req.profiles.full_name.split(' ')[0]}
                            </div>
                        `).join('')}
                        ${dayRequests.length > 3 ? `
                            <div class="text-xs text-gray-500">+${dayRequests.length - 3} altri</div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `
    }
}

// Apri modal giorno
async function openDayModal(dateStr) {
    const date = new Date(dateStr)
    const dayOfWeek = date.getDay()
    
    // Trova dati del giorno
    const specialDay = specialDays.find(sd => sd.date === dateStr)
    const dayRequests = approvedRequests.filter(req => 
        dateStr >= req.start_date && dateStr <= req.end_date
    )
    
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
                    <button onclick="removeSpecialDay('${specialDay.id}')" 
                            class="text-xs text-red-600 hover:text-red-800 mt-2">
                        🗑️ Rimuovi
                    </button>
                </div>
            ` : `
                <div class="flex space-x-2">
                    <button onclick="addSpecialDay('${dateStr}', 'holiday')" 
                            class="flex-1 bg-red-100 text-red-700 px-3 py-2 rounded text-sm hover:bg-red-200">
                        ➕ Aggiungi Festività
                    </button>
                    <button onclick="addSpecialDay('${dateStr}', 'company_closure')" 
                            class="flex-1 bg-orange-100 text-orange-700 px-3 py-2 rounded text-sm hover:bg-orange-200">
                        ➕ Chiusura Aziendale
                    </button>
                </div>
            `}
            
            <!-- Dipendenti Assenti -->
            ${dayRequests.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-sm mb-2">👥 Dipendenti Assenti (${dayRequests.length})</h4>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        ${dayRequests.map(req => `
                            <div class="bg-${req.type === 'ferie' ? 'blue' : 'green'}-50 rounded p-2">
                                <p class="text-sm font-medium">${req.profiles.full_name}</p>
                                <p class="text-xs text-gray-600">
                                    ${req.type.toUpperCase()} - 
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

// Aggiungi giorno speciale
async function addSpecialDay(date, type) {
    const name = prompt(`Nome ${type === 'holiday' ? 'festività' : 'chiusura aziendale'}:`)
    if (!name) return
    
    const description = prompt('Descrizione (opzionale):')
    
    let counts_as_vacation = false
    if (type === 'company_closure') {
        counts_as_vacation = confirm('Questa chiusura conta come giorno di ferie per i dipendenti?')
    }
    
    try {
        window.utils.showLoading()
        
        const { error } = await window.supabaseClient
            .from('special_days')
            .insert([{
                date,
                type,
                name,
                description: description || null,
                counts_as_vacation
            }])
        
        if (error) throw error
        
        window.utils.showToast('Giorno speciale aggiunto con successo', 'success')
        closeDayModal()
        await loadCalendarData()
        renderCalendar()
        
    } catch (error) {
        console.error('Error adding special day:', error)
        window.utils.showToast('Errore nell\'aggiunta del giorno speciale', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Rimuovi giorno speciale
async function removeSpecialDay(id) {
    if (!confirm('Sei sicuro di voler rimuovere questo giorno speciale?')) return
    
    try {
        window.utils.showLoading()
        
        const { error } = await window.supabaseClient
            .from('special_days')
            .delete()
            .eq('id', id)
        
        if (error) throw error
        
        window.utils.showToast('Giorno speciale rimosso', 'success')
        closeDayModal()
        await loadCalendarData()
        renderCalendar()
        
    } catch (error) {
        console.error('Error removing special day:', error)
        window.utils.showToast('Errore nella rimozione', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Mostra modal gestione orari
async function showWorkScheduleModal() {
    const content = `
        <div class="space-y-4">
            <button onclick="addNewSchedule()" 
                    class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                ➕ Aggiungi Nuova Configurazione
            </button>
            
            <div class="space-y-4">
                ${workSchedules.map(schedule => `
                    <div class="border rounded-lg p-4">
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-semibold">${schedule.name}</h4>
                                <p class="text-sm text-gray-600">
                                    Dal ${schedule.start_date} al ${schedule.end_date}
                                </p>
                                <div class="grid grid-cols-7 gap-2 mt-2 text-xs">
                                    <div>Lun: ${schedule.monday_hours}h</div>
                                    <div>Mar: ${schedule.tuesday_hours}h</div>
                                    <div>Mer: ${schedule.wednesday_hours}h</div>
                                    <div>Gio: ${schedule.thursday_hours}h</div>
                                    <div>Ven: ${schedule.friday_hours}h</div>
                                    <div>Sab: ${schedule.saturday_hours}h</div>
                                    <div>Dom: ${schedule.sunday_hours}h</div>
                                </div>
                                <p class="text-sm text-blue-600 mt-1">
                                    Totale settimanale: ${schedule.total_weekly_hours} ore
                                </p>
                            </div>
                            <div class="flex space-x-2">
                                <button onclick="editSchedule('${schedule.id}')" 
                                        class="text-blue-600 hover:text-blue-800">
                                    ✏️
                                </button>
                                <button onclick="deleteSchedule('${schedule.id}')" 
                                        class="text-red-600 hover:text-red-800">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="flex justify-end pt-4 border-t">
                <button onclick="closeScheduleModal()" 
                        class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                    Chiudi
                </button>
            </div>
        </div>
    `
    
    document.getElementById('scheduleContent').innerHTML = content
    document.getElementById('scheduleModal').classList.remove('hidden')
}

// Chiudi modal orari
function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.add('hidden')
}

// Aggiungi nuova configurazione orari
async function addNewSchedule() {
    // Per semplicità uso prompt, in produzione userei un form
    const name = prompt('Nome configurazione (es: Orario Estivo):')
    if (!name) return
    
    const start_date = prompt('Data inizio (YYYY-MM-DD):')
    const end_date = prompt('Data fine (YYYY-MM-DD):')
    
    const monday = parseFloat(prompt('Ore Lunedì:') || '0')
    const tuesday = parseFloat(prompt('Ore Martedì:') || '0')
    const wednesday = parseFloat(prompt('Ore Mercoledì:') || '0')
    const thursday = parseFloat(prompt('Ore Giovedì:') || '0')
    const friday = parseFloat(prompt('Ore Venerdì:') || '0')
    const saturday = parseFloat(prompt('Ore Sabato:') || '0')
    const sunday = parseFloat(prompt('Ore Domenica:') || '0')
    
    try {
        window.utils.showLoading()
        
        const { error } = await window.supabaseClient
            .from('work_schedules')
            .insert([{
                name,
                start_date,
                end_date,
                monday_hours: monday,
                tuesday_hours: tuesday,
                wednesday_hours: wednesday,
                thursday_hours: thursday,
                friday_hours: friday,
                saturday_hours: saturday,
                sunday_hours: sunday
            }])
        
        if (error) throw error
        
        window.utils.showToast('Configurazione orari aggiunta', 'success')
        await loadCalendarData()
        showWorkScheduleModal()
        
    } catch (error) {
        console.error('Error adding schedule:', error)
        window.utils.showToast('Errore nell\'aggiunta', 'error')
    } finally {
        window.utils.hideLoading()
    }
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
    const today = new Date().toISOString().split('T')[0]
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
window.addSpecialDay = addSpecialDay
window.removeSpecialDay = removeSpecialDay
window.showWorkScheduleModal = showWorkScheduleModal
window.closeScheduleModal = closeScheduleModal
window.addNewSchedule = addNewSchedule

// Aggiungi queste funzioni nel file calendar-admin.js

// Modifica configurazione orari
async function editSchedule(scheduleId) {
    try {
        // Trova la configurazione da modificare
        const schedule = workSchedules.find(s => s.id === scheduleId)
        if (!schedule) {
            window.utils.showToast('Configurazione non trovata', 'error')
            return
        }

        // Form di modifica
        const content = `
            <div class="space-y-4">
                <h3 class="font-semibold text-lg">Modifica Configurazione Orari</h3>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input type="text" id="edit_name" value="${schedule.name}" 
                           class="w-full border border-gray-300 rounded-md px-3 py-2">
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
                        <input type="date" id="edit_start_date" value="${schedule.start_date}" 
                               class="w-full border border-gray-300 rounded-md px-3 py-2">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
                        <input type="date" id="edit_end_date" value="${schedule.end_date}" 
                               class="w-full border border-gray-300 rounded-md px-3 py-2">
                    </div>
                </div>
                
                <div>
                    <h4 class="font-medium text-sm mb-2">Ore per giorno</h4>
                    <div class="grid grid-cols-7 gap-2">
                        <div>
                            <label class="text-xs">Lun</label>
                            <input type="number" id="edit_monday" value="${schedule.monday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Mar</label>
                            <input type="number" id="edit_tuesday" value="${schedule.tuesday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Mer</label>
                            <input type="number" id="edit_wednesday" value="${schedule.wednesday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Gio</label>
                            <input type="number" id="edit_thursday" value="${schedule.thursday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Ven</label>
                            <input type="number" id="edit_friday" value="${schedule.friday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Sab</label>
                            <input type="number" id="edit_saturday" value="${schedule.saturday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                        <div>
                            <label class="text-xs">Dom</label>
                            <input type="number" id="edit_sunday" value="${schedule.sunday_hours}" 
                                   step="0.01" min="0" max="24"
                                   class="w-full border rounded px-2 py-1 text-sm">
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end space-x-3 pt-4 border-t">
                    <button onclick="closeScheduleModal()" 
                            class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
                        Annulla
                    </button>
                    <button onclick="saveScheduleEdit('${scheduleId}')" 
                            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Salva Modifiche
                    </button>
                </div>
            </div>
        `
        
        document.getElementById('scheduleContent').innerHTML = content
        
    } catch (error) {
        console.error('Error editing schedule:', error)
        window.utils.showToast('Errore nella modifica', 'error')
    }
}

// Salva modifiche configurazione
async function saveScheduleEdit(scheduleId) {
    try {
        window.utils.showLoading()
        
        const updateData = {
            name: document.getElementById('edit_name').value,
            start_date: document.getElementById('edit_start_date').value,
            end_date: document.getElementById('edit_end_date').value,
            monday_hours: parseFloat(document.getElementById('edit_monday').value) || 0,
            tuesday_hours: parseFloat(document.getElementById('edit_tuesday').value) || 0,
            wednesday_hours: parseFloat(document.getElementById('edit_wednesday').value) || 0,
            thursday_hours: parseFloat(document.getElementById('edit_thursday').value) || 0,
            friday_hours: parseFloat(document.getElementById('edit_friday').value) || 0,
            saturday_hours: parseFloat(document.getElementById('edit_saturday').value) || 0,
            sunday_hours: parseFloat(document.getElementById('edit_sunday').value) || 0
        }
        
        const { error } = await window.supabaseClient
            .from('work_schedules')
            .update(updateData)
            .eq('id', scheduleId)
        
        if (error) throw error
        
        window.utils.showToast('Configurazione orari aggiornata', 'success')
        await loadCalendarData()
        showWorkScheduleModal()
        
    } catch (error) {
        console.error('Error saving schedule:', error)
        window.utils.showToast('Errore nel salvataggio', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Elimina configurazione orari
async function deleteSchedule(scheduleId) {
    if (!confirm('Sei sicuro di voler eliminare questa configurazione orari?')) return
    
    try {
        window.utils.showLoading()
        
        const { error } = await window.supabaseClient
            .from('work_schedules')
            .delete()
            .eq('id', scheduleId)
        
        if (error) throw error
        
        window.utils.showToast('Configurazione orari eliminata', 'success')
        await loadCalendarData()
        showWorkScheduleModal()
        
    } catch (error) {
        console.error('Error deleting schedule:', error)
        window.utils.showToast('Errore nell\'eliminazione', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Aggiungi anche questa versione migliorata di addNewSchedule con un form migliore
async function addNewSchedule() {
    const content = `
        <div class="space-y-4">
            <h3 class="font-semibold text-lg">Nuova Configurazione Orari</h3>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input type="text" id="new_name" placeholder="es: Orario Estivo" 
                       class="w-full border border-gray-300 rounded-md px-3 py-2">
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Data Inizio</label>
                    <input type="date" id="new_start_date" 
                           class="w-full border border-gray-300 rounded-md px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Data Fine</label>
                    <input type="date" id="new_end_date" 
                           class="w-full border border-gray-300 rounded-md px-3 py-2">
                </div>
            </div>
            
            <div>
                <h4 class="font-medium text-sm mb-2">Ore per giorno</h4>
                <div class="grid grid-cols-7 gap-2">
                    <div>
                        <label class="text-xs">Lun</label>
                        <input type="number" id="new_monday" value="8" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Mar</label>
                        <input type="number" id="new_tuesday" value="8" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Mer</label>
                        <input type="number" id="new_wednesday" value="8" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Gio</label>
                        <input type="number" id="new_thursday" value="8" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Ven</label>
                        <input type="number" id="new_friday" value="8" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Sab</label>
                        <input type="number" id="new_saturday" value="0" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                    <div>
                        <label class="text-xs">Dom</label>
                        <input type="number" id="new_sunday" value="0" 
                               step="0.01" min="0" max="24"
                               class="w-full border rounded px-2 py-1 text-sm">
                    </div>
                </div>
            </div>
            
            <div class="flex justify-end space-x-3 pt-4 border-t">
                <button onclick="closeScheduleModal()" 
                        class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
                    Annulla
                </button>
                <button onclick="saveNewSchedule()" 
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Crea Configurazione
                </button>
            </div>
        </div>
    `
    
    document.getElementById('scheduleContent').innerHTML = content
}

// Salva nuova configurazione
async function saveNewSchedule() {
    try {
        window.utils.showLoading()
        
        const scheduleData = {
            name: document.getElementById('new_name').value,
            start_date: document.getElementById('new_start_date').value,
            end_date: document.getElementById('new_end_date').value,
            monday_hours: parseFloat(document.getElementById('new_monday').value) || 0,
            tuesday_hours: parseFloat(document.getElementById('new_tuesday').value) || 0,
            wednesday_hours: parseFloat(document.getElementById('new_wednesday').value) || 0,
            thursday_hours: parseFloat(document.getElementById('new_thursday').value) || 0,
            friday_hours: parseFloat(document.getElementById('new_friday').value) || 0,
            saturday_hours: parseFloat(document.getElementById('new_saturday').value) || 0,
            sunday_hours: parseFloat(document.getElementById('new_sunday').value) || 0
        }
        
        if (!scheduleData.name || !scheduleData.start_date || !scheduleData.end_date) {
            window.utils.showToast('Compila tutti i campi richiesti', 'error')
            window.utils.hideLoading()
            return
        }
        
        const { error } = await window.supabaseClient
            .from('work_schedules')
            .insert([scheduleData])
        
        if (error) throw error
        
        window.utils.showToast('Configurazione orari creata', 'success')
        await loadCalendarData()
        showWorkScheduleModal()
        
    } catch (error) {
        console.error('Error creating schedule:', error)
        window.utils.showToast('Errore nella creazione', 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Rendi le funzioni globali
window.editSchedule = editSchedule
window.saveScheduleEdit = saveScheduleEdit
window.deleteSchedule = deleteSchedule
window.saveNewSchedule = saveNewSchedule