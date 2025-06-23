// Sistema gestione richieste MIGLIORATO
class RequestManager {
    constructor() {
        this.modal = null
        this.currentBalance = null
    }

    // Mostra form nuova richiesta
    showRequestForm(balance) {
        this.currentBalance = balance
        this.createModal()
    }

    // Crea modal per form richiesta
    createModal() {
        const modalHTML = `
            <div id="requestModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-900">📝 Nuova Richiesta</h2>
                        <button onclick="requestManager.closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">
                            ✕
                        </button>
                    </div>

                    <form id="requestForm" class="space-y-4">
                        <!-- Tipo Richiesta -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                🎯 Tipo di Richiesta
                            </label>
                            <select id="requestType" class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                                <option value="ferie">🏖️ Ferie (${this.currentBalance?.ferie_residue || 0}/${this.currentBalance?.ferie_totali || 26} giorni disponibili)</option>
                                <option value="rol">⏰ ROL (${this.currentBalance?.rol_residue || 0}/${this.currentBalance?.rol_totali || 56} ore disponibili)</option>
                                <option value="ex_festivita">🎉 Ex-Festività (${this.currentBalance?.ex_festivita_residue || 0}/${this.currentBalance?.ex_festivita_totali || 32} ore disponibili)</option>
                                <option value="malattia">🤒 Malattia</option>
                            </select>
                        </div>

                        <!-- Tipo di durata (solo per ROL/Ex-festività) -->
                        <div id="durationType" class="hidden">
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                ⏱️ Tipo di permesso
                            </label>
                            <div class="flex space-x-4">
                                <label class="flex items-center">
                                    <input type="radio" name="duration_type" value="full_day" checked class="mr-2">
                                    <span>Giorno intero</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="duration_type" value="hours" class="mr-2">
                                    <span>Ore specifiche</span>
                                </label>
                            </div>
                        </div>

                        <!-- Date -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    📅 Data Inizio
                                </label>
                                <input
                                    type="date"
                                    id="startDate"
                                    required
                                    min="${new Date().toISOString().split('T')[0]}"
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div id="endDateContainer">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    📅 Data Fine
                                </label>
                                <input
                                    type="date"
                                    id="endDate"
                                    required
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <!-- Ore (solo quando selezionato "ore specifiche") -->
                        <div id="hoursSection" class="hidden">
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                ⏱️ Ore Richieste
                            </label>
                            <input
                                type="number"
                                id="requestHours"
                                min="1"
                                max="8"
                                value="8"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p class="text-sm text-gray-500 mt-1">Minimo 1 ora, massimo 8 ore al giorno</p>
                        </div>

                        <!-- Info calcolata -->
                        <div id="calculatedInfo" class="bg-blue-50 rounded-lg p-4 hidden">
                            <h3 class="font-medium text-blue-900 mb-2">📊 Riepilogo Richiesta</h3>
                            <div id="calculatedDetails" class="text-sm text-blue-700"></div>
                        </div>

                        <!-- Motivo -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                📝 Motivo (opzionale)
                            </label>
                            <textarea
                                id="requestReason"
                                rows="3"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Descrivi brevemente il motivo della richiesta..."
                            ></textarea>
                        </div>

                        <!-- Buttons -->
                        <div class="flex justify-end space-x-3 pt-4">
                            <button
                                type="button"
                                onclick="requestManager.closeModal()"
                                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                class="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                🚀 Invia Richiesta
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `

        // Aggiungi modal al DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML)
        this.modal = document.getElementById('requestModal')
        
        // Setup event listeners
        this.setupFormListeners()
    }

    // Setup eventi form
    setupFormListeners() {
        const typeSelect = document.getElementById('requestType')
        const startDate = document.getElementById('startDate')
        const endDate = document.getElementById('endDate')
        const form = document.getElementById('requestForm')
        const durationRadios = document.querySelectorAll('input[name="duration_type"]')

        // Cambio tipo richiesta
        typeSelect.addEventListener('change', () => {
            this.updateFormVisibility()
            this.calculateRequest()
        })

        // Cambio tipo durata (giorno intero vs ore)
        durationRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateDurationVisibility()
                this.calculateRequest()
            })
        })

        // Cambio date
        startDate.addEventListener('change', () => {
            endDate.min = startDate.value
            this.calculateRequest()
        })

        endDate.addEventListener('change', () => {
            this.calculateRequest()
        })

        // Cambio ore
        document.getElementById('requestHours').addEventListener('input', () => {
            this.calculateRequest()
        })

        // Submit form
        form.addEventListener('submit', (e) => {
            e.preventDefault()
            this.submitRequest()
        })

        // Initial setup
        this.updateFormVisibility()
    }

    // Aggiorna visibilità campi
    updateFormVisibility() {
        const type = document.getElementById('requestType').value
        const durationTypeDiv = document.getElementById('durationType')

        if (type === 'rol' || type === 'ex_festivita') {
            durationTypeDiv.classList.remove('hidden')
            this.updateDurationVisibility()
        } else {
            durationTypeDiv.classList.add('hidden')
            document.getElementById('hoursSection').classList.add('hidden')
            document.getElementById('endDateContainer').classList.remove('hidden')
        }
    }

    // Aggiorna visibilità in base al tipo di durata
    updateDurationVisibility() {
        const durationType = document.querySelector('input[name="duration_type"]:checked')?.value
        const hoursSection = document.getElementById('hoursSection')
        const endDateContainer = document.getElementById('endDateContainer')

        if (durationType === 'hours') {
            hoursSection.classList.remove('hidden')
            endDateContainer.classList.add('hidden')
            // Per ore specifiche, data fine = data inizio
            document.getElementById('endDate').value = document.getElementById('startDate').value
        } else {
            hoursSection.classList.add('hidden')
            endDateContainer.classList.remove('hidden')
        }
    }

    // Calcola richiesta
    calculateRequest() {
        const type = document.getElementById('requestType').value
        const startDate = document.getElementById('startDate').value
        const endDate = document.getElementById('endDate').value
        const hours = document.getElementById('requestHours').value
        const durationType = document.querySelector('input[name="duration_type"]:checked')?.value

        if (!startDate || !endDate) return

        const start = new Date(startDate)
        const end = new Date(endDate)
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

        const info = document.getElementById('calculatedInfo')
        const details = document.getElementById('calculatedDetails')

        if (days > 0) {
            info.classList.remove('hidden')
            
            let content = ''
            let totalHours = 0

            if (type === 'ferie' || type === 'malattia') {
                content = `
                    <p><strong>Periodo:</strong> dal ${start.toLocaleDateString('it-IT')} al ${end.toLocaleDateString('it-IT')}</p>
                    <p><strong>Giorni richiesti:</strong> ${days} giorni</p>
                `
            } else if (type === 'rol' || type === 'ex_festivita') {
                if (durationType === 'hours') {
                    totalHours = parseInt(hours)
                    content = `
                        <p><strong>Data:</strong> ${start.toLocaleDateString('it-IT')}</p>
                        <p><strong>Ore richieste:</strong> ${hours} ore</p>
                    `
                } else {
                    totalHours = days * 8
                    content = `
                        <p><strong>Periodo:</strong> dal ${start.toLocaleDateString('it-IT')} al ${end.toLocaleDateString('it-IT')}</p>
                        <p><strong>Giorni richiesti:</strong> ${days} giorni (${totalHours} ore totali)</p>
                    `
                }
            }

            // Controllo disponibilità
            if (this.currentBalance) {
                let warning = ''
                if (type === 'ferie' && days > this.currentBalance.ferie_residue) {
                    warning = `<p class="text-red-600 mt-2"><strong>⚠️ Attenzione:</strong> Non hai abbastanza ferie disponibili!</p>`
                } else if (type === 'rol' && totalHours > this.currentBalance.rol_residue) {
                    warning = `<p class="text-red-600 mt-2"><strong>⚠️ Attenzione:</strong> Non hai abbastanza ore ROL disponibili!</p>`
                } else if (type === 'ex_festivita' && totalHours > this.currentBalance.ex_festivita_residue) {
                    warning = `<p class="text-red-600 mt-2"><strong>⚠️ Attenzione:</strong> Non hai abbastanza ore ex-festività disponibili!</p>`
                }
                content += warning
            }

            details.innerHTML = content
        } else {
            info.classList.add('hidden')
        }
    }

    // Invia richiesta
    async submitRequest() {
        try {
            const session = await window.utils.checkAuth()
            if (!session) {
                window.utils.showToast('Sessione scaduta', 'error')
                return
            }

            const type = document.getElementById('requestType').value
            const durationType = document.querySelector('input[name="duration_type"]:checked')?.value

            const formData = {
                employee_id: session.user.id,
                type: type,
                start_date: document.getElementById('startDate').value,
                end_date: document.getElementById('endDate').value,
                reason: document.getElementById('requestReason').value.trim() || null,
                status: 'pending'
            }

            // Calcola giorni e ore in base al tipo
            if (type === 'ferie' || type === 'malattia') {
                const start = new Date(formData.start_date)
                const end = new Date(formData.end_date)
                formData.days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
            } else if (type === 'rol' || type === 'ex_festivita') {
                if (durationType === 'hours') {
                    // Ore specifiche
                    formData.hours = parseInt(document.getElementById('requestHours').value)
                    formData.days = null
                } else {
                    // Giorni interi
                    const start = new Date(formData.start_date)
                    const end = new Date(formData.end_date)
                    formData.days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
                    formData.hours = null  // Sarà calcolato automaticamente in fase di approvazione
                }
            }

            // Validazione
            if (!this.validateRequest(formData, durationType)) return

            window.utils.showLoading()

            // Inserisci richiesta
            const { data, error } = await window.supabaseClient
                .from('requests')
                .insert([formData])
                .select()
                .single()

            if (error) throw error

            window.utils.showToast('✅ Richiesta inviata con successo!', 'success')
            this.closeModal()
            
            // Ricarica dati dashboard
            if (typeof loadEmployeeData === 'function') {
                loadEmployeeData()
            } else if (typeof loadRequestsStats === 'function') {
                const session = await window.utils.checkAuth()
                loadRequestsStats(session.user.id)
            }

        } catch (error) {
            console.error('Errore invio richiesta:', error)
            window.utils.showToast('❌ Errore nell\'invio della richiesta', 'error')
        } finally {
            window.utils.hideLoading()
        }
    }

    // Valida richiesta
    validateRequest(formData, durationType) {
        if (!formData.start_date || !formData.end_date) {
            window.utils.showToast('Seleziona le date', 'error')
            return false
        }

        if (formData.start_date > formData.end_date) {
            window.utils.showToast('Data fine deve essere successiva alla data inizio', 'error')
            return false
        }

        // Controllo disponibilità
        if (this.currentBalance) {
            const type = formData.type
            
            if (type === 'ferie' && formData.days > this.currentBalance.ferie_residue) {
                window.utils.showToast('Non hai abbastanza giorni di ferie disponibili', 'error')
                return false
            } else if (type === 'rol') {
                const totalHours = formData.hours || (formData.days * 8)
                if (totalHours > this.currentBalance.rol_residue) {
                    window.utils.showToast('Non hai abbastanza ore ROL disponibili', 'error')
                    return false
                }
            } else if (type === 'ex_festivita') {
                const totalHours = formData.hours || (formData.days * 8)
                if (totalHours > this.currentBalance.ex_festivita_residue) {
                    window.utils.showToast('Non hai abbastanza ore ex-festività disponibili', 'error')
                    return false
                }
            }
        }

        return true
    }

    // Chiudi modal
    closeModal() {
        if (this.modal) {
            this.modal.remove()
            this.modal = null
        }
    }
}

// Inizializza gestore richieste
const requestManager = new RequestManager()
window.requestManager = requestManager