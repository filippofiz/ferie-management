// Variabili globali
let currentTab = 'overview'
let tutorsData = []
let evaluationsData = []

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

    // Initialize page
    await loadData()
    initializeCharts()
    setupEventListeners()
    
    window.utils.hideLoading()
})

// Carica tutti i dati necessari
async function loadData() {
    try {
        // 1. Carica lista REALE dei tutor dal database
        const { data: tutors, error: tutorsError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('role', 'employee') // Tutti gli employee sono valutabili
            .eq('is_active', true)
            .order('full_name')

        if (tutorsError) throw tutorsError

        console.log('Employee/Tutor trovati:', tutors?.length || 0)

        // 2. Carica valutazioni esistenti
        const { data: evaluations, error: evalError } = await window.supabaseClient
            .from('evaluations')
            .select(`
                *,
                tutor:profiles!tutor_id(full_name, email),
                evaluator:profiles!evaluator_id(full_name)
            `)
            .order('created_at', { ascending: false })

        if (evalError && evalError.code !== 'PGRST116') {
            console.error('Errore caricamento valutazioni:', evalError)
        }

        // 3. Carica metriche attuali dei tutor
        const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
        const { data: metrics, error: metricsError } = await window.supabaseClient
            .from('tutor_metrics_history')
            .select('*')
            .eq('month', currentMonth)

        if (metricsError && metricsError.code !== 'PGRST116') {
            console.error('Errore metriche:', metricsError)
        }

        // 4. Combina i dati per creare tutorsData
        tutorsData = tutors?.map(tutor => {
            // Trova ultima valutazione
            const lastEval = evaluations?.find(e => e.tutor_id === tutor.id)
            
            // Trova metriche correnti
            const currentMetrics = metrics?.find(m => m.tutor_id === tutor.id)

            return {
                id: tutor.id,
                name: tutor.full_name,
                email: tutor.email,
                subjects: tutor.subjects || [], // Assumendo che ci sia un campo subjects in profiles
                activeStudents: currentMetrics?.active_students || 0,
                avgImprovement: lastEval?.avg_grade_improvement || 0,
                nps: lastEval?.nps_score || 0,
                retentionRate: lastEval?.retention_rate || 0,
                lastEvaluation: lastEval?.created_at ? new Date(lastEval.created_at).toLocaleDateString('it-IT') : 'Mai valutato',
                lastEvalScore: lastEval?.final_score || null
            }
        }) || []

        // 5. Aggiorna la tabella dei tutor
        updateTutorsTable()

        // 6. Carica valutazioni in corso
        await loadPendingEvaluations()

        // 7. Calcola KPI globali
        calculateGlobalKPIs()

    } catch (error) {
        console.error('Error loading data:', error)
        window.utils.showToast('Errore nel caricamento dati', 'error')
    }
}

// Nuova funzione per aggiornare la tabella tutor
function updateTutorsTable() {
    const tbody = document.querySelector('#content-tutors tbody')
    if (!tbody) return

    if (tutorsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                    Nessun tutor trovato. Assicurati che i profili abbiano role='tutor' o is_tutor=true
                </td>
            </tr>
        `
        return
    }

    tbody.innerHTML = tutorsData.map(tutor => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap">
                <div>
                    <div class="text-sm font-medium text-gray-900">${tutor.name}</div>
                    <div class="text-sm text-gray-500">${tutor.email}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${tutor.subjects.map(s => 
                    `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 mr-1">${s}</span>`
                ).join('') || '<span class="text-gray-400">-</span>'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${tutor.activeStudents}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-green-600 font-medium">
                    ${tutor.avgImprovement > 0 ? '+' : ''}${tutor.avgImprovement.toFixed(1)}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-purple-600 font-medium">${tutor.nps.toFixed(1)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${tutor.lastEvaluation}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewTutorDetail('${tutor.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Dettagli</button>
                <button onclick="startEvaluation('${tutor.id}')" class="text-green-600 hover:text-green-900">Valuta</button>
            </td>
        </tr>
    `).join('')
}

// Carica valutazioni in corso
async function loadPendingEvaluations() {
    try {
        // Prendi periodo corrente
        const { data: currentPeriod } = await window.supabaseClient
            .from('evaluation_periods')
            .select('*')
            .eq('is_active', true)
            .single()

        if (!currentPeriod) {
            console.log('Nessun periodo di valutazione attivo')
            return
        }

        // Conta valutazioni da fare
        const pendingCount = tutorsData.filter(t => 
            !t.lastEvaluation || t.lastEvaluation === 'Mai valutato'
        ).length

        // Aggiorna UI
        document.getElementById('pendingEvaluations').textContent = pendingCount

    } catch (error) {
        console.error('Error loading pending evaluations:', error)
    }
}

// Calcola KPI globali
function calculateGlobalKPIs() {
    if (tutorsData.length === 0) {
        console.log('Nessun tutor per calcolare KPI')
        return
    }

    const avgImprovement = tutorsData.reduce((acc, t) => acc + (t.avgImprovement || 0), 0) / tutorsData.length
    const avgNPS = tutorsData.reduce((acc, t) => acc + (t.nps || 0), 0) / tutorsData.length
    const avgRetention = tutorsData.reduce((acc, t) => acc + (t.retentionRate || 0), 0) / tutorsData.length
    
    // Aggiorna UI con valori reali (se gli elementi esistono)
    const improvementEl = document.querySelector('.bg-white .text-green-600')
    if (improvementEl) improvementEl.textContent = `+${avgImprovement.toFixed(1)}`
    
    const npsEl = document.querySelector('.bg-white .text-purple-600')
    if (npsEl) npsEl.textContent = avgNPS.toFixed(1)
    
    const retentionEl = document.querySelector('.bg-white .text-indigo-600')
    if (retentionEl) retentionEl.textContent = `${avgRetention.toFixed(0)}%`

    // Aggiorna Top Performers
    updateTopPerformers()
}

// Aggiorna lista top performers
function updateTopPerformers() {
    const container = document.getElementById('topPerformers')
    if (!container) return

    // Ordina tutor per punteggio (usa lastEvalScore o una combinazione di metriche)
    const sortedTutors = [...tutorsData]
        .filter(t => t.lastEvalScore || (t.avgImprovement > 0 && t.nps > 0))
        .sort((a, b) => {
            // Usa lastEvalScore se disponibile, altrimenti calcola un punteggio composito
            const scoreA = a.lastEvalScore || ((a.avgImprovement * 2) + (a.nps / 2)) / 2
            const scoreB = b.lastEvalScore || ((b.avgImprovement * 2) + (b.nps / 2)) / 2
            return scoreB - scoreA
        })
        .slice(0, 3) // Top 3

    if (sortedTutors.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center py-4">Nessun dato disponibile</div>'
        return
    }

    const medals = ['🥇', '🥈', '🥉']
    const bgColors = ['bg-yellow-50', 'bg-gray-50', 'bg-orange-50']

    container.innerHTML = sortedTutors.map((tutor, index) => `
        <div class="flex items-center justify-between ${bgColors[index]} rounded p-3">
            <div class="flex items-center">
                <span class="text-2xl mr-3">${medals[index]}</span>
                <div>
                    <p class="font-medium">${tutor.name}</p>
                    <p class="text-sm text-gray-600">${tutor.subjects.join(', ') || 'Nessuna materia'}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-green-600">
                    ${tutor.lastEvalScore ? `${tutor.lastEvalScore.toFixed(1)}/5` : `+${tutor.avgImprovement.toFixed(1)}`}
                </p>
                <p class="text-xs text-gray-500">${tutor.activeStudents} studenti</p>
            </div>
        </div>
    `).join('')
}

// Inizializza grafici
function initializeCharts() {
    // Calcola distribuzione performance dai dati reali
    const distribution = {
        excellent: 0,
        good: 0,
        adequate: 0,
        needsImprovement: 0
    }
    
    tutorsData.forEach(tutor => {
        if (tutor.lastEvalScore) {
            if (tutor.lastEvalScore >= 4.5) distribution.excellent++
            else if (tutor.lastEvalScore >= 3.5) distribution.good++
            else if (tutor.lastEvalScore >= 2.5) distribution.adequate++
            else distribution.needsImprovement++
        }
    })

    // Grafico distribuzione performance
    const ctxPerf = document.getElementById('performanceChart').getContext('2d')
    new Chart(ctxPerf, {
        type: 'doughnut',
        data: {
            labels: ['Eccellente', 'Buono', 'Adeguato', 'Migliorabile'],
            datasets: [{
                data: [
                    distribution.excellent, 
                    distribution.good, 
                    distribution.adequate, 
                    distribution.needsImprovement
                ],
                backgroundColor: [
                    '#10b981',
                    '#3b82f6',
                    '#f59e0b',
                    '#ef4444'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    })

    // Per il trend, dovremmo caricare dati storici
    loadHistoricalData().then(historicalData => {
        const ctxTrend = document.getElementById('improvementChart').getContext('2d')
        new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: historicalData.labels,
                datasets: [{
                    label: 'Media Miglioramento Voti',
                    data: historicalData.values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 2
                    }
                }
            }
        })
    })
}

// Carica dati storici per il grafico trend
async function loadHistoricalData() {
    try {
        const { data } = await window.supabaseClient
            .from('tutor_metrics_history')
            .select('month, avg_grade_improvement')
            .order('month', { ascending: true })
            .limit(5)

        if (data && data.length > 0) {
            return {
                labels: data.map(d => {
                    const date = new Date(d.month)
                    return date.toLocaleDateString('it-IT', { month: 'short' })
                }),
                values: data.map(d => d.avg_grade_improvement || 0)
            }
        }
    } catch (error) {
        console.error('Error loading historical data:', error)
    }

    // Fallback se non ci sono dati
    return {
        labels: ['Set', 'Ott', 'Nov', 'Dic', 'Gen'],
        values: [0.9, 1.0, 1.1, 1.2, 1.2]
    }
}

// Setup event listeners
function setupEventListeners() {
    // Range inputs con visualizzazione valore
    const rangeInputs = ['voteImprovement', 'objectives', 'methodology', 'mastery']
    rangeInputs.forEach(id => {
        const input = document.getElementById(id)
        const valueSpan = document.getElementById(id + 'Value')
        
        if (input && valueSpan) {
            input.addEventListener('input', (e) => {
                valueSpan.textContent = e.target.value
                calculateFinalScore()
            })
        }
    })

    // Form submission
    const form = document.getElementById('evaluationForm')
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault()
            await saveEvaluation()
        })
    }
}

// Mostra tab
function showTab(tabName) {
    // Nascondi tutti i contenuti
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden')
    })
    
    // Rimuovi active da tutti i tab
    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.classList.remove('border-indigo-500', 'text-indigo-600')
        tab.classList.add('border-transparent', 'text-gray-500')
    })
    
    // Mostra contenuto selezionato
    document.getElementById(`content-${tabName}`).classList.remove('hidden')
    
    // Attiva tab selezionato
    const activeTab = document.getElementById(`tab-${tabName}`)
    activeTab.classList.remove('border-transparent', 'text-gray-500')
    activeTab.classList.add('border-indigo-500', 'text-indigo-600')
    
    currentTab = tabName
}

// Mostra modal nuova valutazione
function showNewEvaluationModal() {
    // Popola dropdown con tutor reali
    const select = document.querySelector('#evaluationForm select')
    if (select && tutorsData.length > 0) {
        select.innerHTML = `
            <option value="">Seleziona un tutor...</option>
            ${tutorsData.map(t => 
                `<option value="${t.id}">${t.name} - ${t.subjects.join(', ') || 'Nessuna materia'}</option>`
            ).join('')}
        `
    }
    
    document.getElementById('evaluationModal').classList.remove('hidden')
}

// Avvia valutazione per tutor specifico
function startEvaluation(tutorId) {
    // Pre-popola il form con i dati del tutor
    const tutor = tutorsData.find(t => t.id === tutorId)
    if (!tutor) return

    showNewEvaluationModal()
    
    // Seleziona automaticamente il tutor nel dropdown
    const select = document.querySelector('#evaluationForm select')
    if (select) {
        select.value = tutorId
    }
}

// Chiudi modal valutazione
function closeEvaluationModal() {
    document.getElementById('evaluationModal').classList.add('hidden')
    // Reset form
    document.getElementById('evaluationForm').reset()
    
    // Reset anche i valori mostrati
    const rangeInputs = ['voteImprovement', 'objectives', 'methodology', 'mastery']
    rangeInputs.forEach(id => {
        const valueSpan = document.getElementById(id + 'Value')
        if (valueSpan) valueSpan.textContent = '3'
    })
    
    // Reset punteggio finale
    const finalScore = document.getElementById('finalScore')
    if (finalScore) {
        finalScore.textContent = '3.0'
        finalScore.className = 'text-3xl font-bold text-indigo-600'
    }
}

// Visualizza dettagli tutor
function viewTutorDetail(tutorId) {
    // In produzione, navigherebbe a una pagina dettaglio
    console.log('View tutor detail:', tutorId)
    const tutor = tutorsData.find(t => t.id === tutorId)
    if (tutor) {
        window.utils.showToast(`Dettagli ${tutor.name}: NPS ${tutor.nps}, Retention ${tutor.retentionRate}%`, 'success')
    }
}

// Calcola punteggio finale
function calculateFinalScore() {
    // Pesi delle sezioni
    const weights = {
        didactic: 0.50,
        professional: 0.30,
        operational: 0.20
    }
    
    // Ottieni valori
    const voteImprovement = parseInt(document.getElementById('voteImprovement').value)
    const objectives = parseInt(document.getElementById('objectives').value)
    const methodology = parseInt(document.getElementById('methodology').value)
    const mastery = parseInt(document.getElementById('mastery').value)
    
    // Calcola medie per sezione
    const didacticScore = (voteImprovement + objectives) / 2
    const professionalScore = (methodology + mastery) / 2
    
    // Per ora usiamo 3 come default per operational (in produzione verrebbe calcolato)
    const operationalScore = 3
    
    // Calcola punteggio finale ponderato
    const finalScore = (
        didacticScore * weights.didactic +
        professionalScore * weights.professional +
        operationalScore * weights.operational
    )
    
    // Aggiorna UI
    document.getElementById('finalScore').textContent = finalScore.toFixed(1)
    
    // Colora in base al punteggio
    const scoreElement = document.getElementById('finalScore')
    if (finalScore >= 4.5) {
        scoreElement.className = 'text-3xl font-bold text-green-600'
    } else if (finalScore >= 3.5) {
        scoreElement.className = 'text-3xl font-bold text-blue-600'
    } else if (finalScore >= 2.5) {
        scoreElement.className = 'text-3xl font-bold text-yellow-600'
    } else {
        scoreElement.className = 'text-3xl font-bold text-red-600'
    }
}

// Salva valutazione
async function saveEvaluation() {
    try {
        window.utils.showLoading()
        
        const form = document.getElementById('evaluationForm')
        const tutorId = form.querySelector('select').value
        
        if (!tutorId) {
            window.utils.showToast('Seleziona un tutor', 'error')
            window.utils.hideLoading()
            return
        }

        // Raccogli dati dal form
        const voteImprovement = parseInt(document.getElementById('voteImprovement').value)
        const objectives = parseInt(document.getElementById('objectives').value)
        const methodology = parseInt(document.getElementById('methodology').value)
        const mastery = parseInt(document.getElementById('mastery').value)
        
        // Calcola punteggi per categoria
        const didacticScore = (voteImprovement + objectives) / 2
        const professionalScore = (methodology + mastery) / 2
        
        // Per ora usiamo valori di esempio per operational
        const retentionInput = form.querySelector('input[placeholder="es. 75"]')
        const npsInput = form.querySelector('input[placeholder="es. 8.5"]')
        
        const retentionRate = parseFloat(retentionInput?.value || 75)
        const npsScore = parseFloat(npsInput?.value || 8.5)
        
        // Calcola operational score basato sui valori inseriti
        let operationalScore = 3 // default
        if (retentionRate >= 85) operationalScore = 5
        else if (retentionRate >= 70) operationalScore = 4
        else if (retentionRate >= 55) operationalScore = 3
        else if (retentionRate >= 40) operationalScore = 2
        else operationalScore = 1

        // Ottieni periodo attivo
        const { data: activePeriod } = await window.supabaseClient
            .from('evaluation_periods')
            .select('id')
            .eq('is_active', true)
            .single()

        if (!activePeriod) {
            // Crea un nuovo periodo se non esiste
            const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)
            const currentYear = new Date().getFullYear()
            
            const { data: newPeriod, error: periodError } = await window.supabaseClient
                .from('evaluation_periods')
                .insert({
                    name: `Q${currentQuarter} ${currentYear}`,
                    start_date: new Date(currentYear, (currentQuarter - 1) * 3, 1).toISOString().split('T')[0],
                    end_date: new Date(currentYear, currentQuarter * 3, 0).toISOString().split('T')[0],
                    is_active: true
                })
                .select()
                .single()

            if (periodError) throw periodError
            activePeriod.id = newPeriod.id
        }

        // Prepara dati valutazione
        const evaluationData = {
            tutor_id: tutorId,
            evaluator_id: (await window.utils.checkAuth()).user.id,
            period_id: activePeriod.id,
            didactic_score: didacticScore,
            professional_score: professionalScore,
            operational_score: operationalScore,
            avg_grade_improvement: (voteImprovement - 1) * 0.375, // Converte scala 1-5 in incremento voti
            retention_rate: retentionRate,
            nps_score: npsScore,
            manager_feedback: form.querySelector('textarea').value,
            status: 'approved',
            approved_at: new Date().toISOString()
        }

        // Salva nel database
        const { data, error } = await window.supabaseClient
            .from('evaluations')
            .insert(evaluationData)
            .select()

        if (error) throw error

        window.utils.showToast('✅ Valutazione salvata con successo!', 'success')
        closeEvaluationModal()
        
        // Ricarica dati
        await loadData()
        
    } catch (error) {
        console.error('Error saving evaluation:', error)
        window.utils.showToast('❌ Errore nel salvataggio: ' + error.message, 'error')
    } finally {
        window.utils.hideLoading()
    }
}

// Esporta funzioni globali
window.showTab = showTab
window.showNewEvaluationModal = showNewEvaluationModal
window.closeEvaluationModal = closeEvaluationModal
window.startEvaluation = startEvaluation
window.viewTutorDetail = viewTutorDetail
window.calculateFinalScore = calculateFinalScore