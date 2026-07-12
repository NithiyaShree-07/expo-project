// Global State Variables
let currentRole = '';
let currentUsername = '';
let activeCharts = {};
let shoppingCart = [];
let tabHistory = [];
let currentTab = '';
let isNavigatingBack = false;

// Show custom toast notification
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toastNotification');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    
    toastMsg.textContent = message;
    if (isSuccess) {
        toastIcon.className = "fa-solid fa-circle-check toast-icon";
        toast.style.borderColor = "var(--accent-green)";
        toast.style.borderLeftColor = "var(--accent-green)";
        toastIcon.style.color = "var(--accent-green)";
    } else {
        toastIcon.className = "fa-solid fa-circle-xmark toast-icon";
        toast.style.borderColor = "var(--accent-rose)";
        toast.style.borderLeftColor = "var(--accent-rose)";
        toastIcon.style.color = "var(--accent-rose)";
    }
    
    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

// Authentication Modals
function openLoginModal(role) {
    const modal = document.getElementById('loginModal');
    const roleTitle = document.getElementById('modalRoleTitle');
    const roleDesc = document.getElementById('modalRoleDesc');
    const passwordGroup = document.getElementById('passwordGroup');
    const passInput = document.getElementById('password');
    
    document.getElementById('loginRole').value = role;
    document.getElementById('username').value = '';
    passInput.value = '';
    
    if (role === 'admin') {
        roleTitle.textContent = "Municipality Admin Login";
        roleDesc.textContent = "Enter administrator credentials to manage municipal operations";
        passwordGroup.style.display = 'block';
        passInput.required = true;
    } else {
        roleTitle.textContent = "Citizen Portal Access";
        roleDesc.textContent = "Enter your username to manage your personal recycling rewards";
        passwordGroup.style.display = 'none';
        passInput.required = false;
    }
    
    modal.classList.add('active');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
}

// Handle login submit
async function handleLoginSubmit(event) {
    event.preventDefault();
    const role = document.getElementById('loginRole').value;
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    
    const payload = {
        username: user,
        password: role === 'admin' ? pass : 'citizen123',
        role: role
    };
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            closeLoginModal();
            loginSuccess(data.username, data.role);
        } else {
            alert(data.message || 'Login failed. Please check credentials.');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Server unreachable. Make sure Flask app is running.');
    }
}

// Set up UI after login success
function loginSuccess(username, role) {
    currentRole = role;
    currentUsername = username;
    
    document.getElementById('roleSelectionScreen').style.display = 'none';
    document.getElementById('appInterface').style.display = 'flex';
    
    // Set Sidebar profile
    document.getElementById('profileName').textContent = username;
    document.getElementById('avatarLetter').textContent = username.charAt(0).toUpperCase();
    
    const adminMenu = document.getElementById('adminMenu');
    const citizenMenu = document.getElementById('citizenMenu');
    
    // Fresh session: clear any previous tab navigation history
    tabHistory = [];
    currentTab = '';

    if (role === 'admin') {
        document.getElementById('profileRole').textContent = "Municipality Admin";
        adminMenu.style.display = 'block';
        citizenMenu.style.display = 'none';
        switchTab('admin-dashboard');
    } else {
        document.getElementById('profileRole').textContent = "Citizen Portal";
        adminMenu.style.display = 'none';
        citizenMenu.style.display = 'block';
        switchTab('citizen-dashboard');
    }
    showToast(`Welcome back, ${username}!`);
}

// Logout session
function logout() {
    currentRole = '';
    currentUsername = '';
    shoppingCart = [];
    tabHistory = [];
    currentTab = '';
    document.getElementById('appInterface').style.display = 'none';
    document.getElementById('roleSelectionScreen').style.display = 'flex';
    showToast("Session closed successfully.");
}

// Sync global trigger
function triggerDbRefresh() {
    const activeTab = document.querySelector('.sidebar-menu:not([style*="none"]) .menu-item.active').dataset.tab;
    loadTabContent(activeTab);
    showToast("Database and statistics synced.");
}

// Tab panel navigation setup
document.querySelectorAll('.sidebar-menu').forEach(menu => {
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (item) {
            const targetTab = item.dataset.tab;
            // Clear active indicators
            menu.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            switchTab(targetTab);
        }
    });
});

function switchTab(tabId) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Show active panel
    const activePanel = document.getElementById(tabId);
    if (activePanel) {
        activePanel.classList.add('active');

        // Track navigation history so the Back button can return to the
        // previous section (unless this switch IS the result of pressing Back)
        if (!isNavigatingBack && currentTab && currentTab !== tabId) {
            tabHistory.push(currentTab);
        }
        isNavigatingBack = false;
        currentTab = tabId;
        updateBackButtonVisibility();

        // Keep the sidebar menu highlight in sync with the visible panel
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });
        
        // Update header headers
        updateHeaderBar(tabId);
        
        // Load Tab data
        loadTabContent(tabId);
    }
}

// Navigate to the previously viewed section
function goBackTab() {
    if (tabHistory.length === 0) return;
    const previousTab = tabHistory.pop();
    isNavigatingBack = true;
    switchTab(previousTab);
}

function updateBackButtonVisibility() {
    const backBtn = document.getElementById('backTabBtn');
    if (!backBtn) return;
    backBtn.style.display = tabHistory.length > 0 ? 'flex' : 'none';
}

function updateHeaderBar(tabId) {
    const title = document.getElementById('viewTitle');
    const desc = document.getElementById('viewDesc');
    
    const info = {
        'admin-dashboard': { t: "Circular Dashboard Overview", d: "Live metrics of municipal recycling and IoT telemetry feeds" },
        'smart-bins': { t: "Smart Bin Collection Center", d: "IoT sensor telemetry tracking, fill rate predictions, and Optimized routing" },
        'waste-segregation': { t: "AI Waste Segregation Center", d: "Automated conveyor sorting scan predictions & audit records" },
        'recovery-advisor': { t: "Resource Recovery Advisor", d: "AI recommendations for process paths and extraction efficiencies" },
        'circular-economy': { t: "Circular Economy Center", d: "Raw weight to product estimation calculations & carbon credits ledger" },
        'marketplace-mgmt': { t: "Marketplace Management", d: "Manage manufactured catalog inventory and customer purchases" },
        'selling-requests': { t: "Citizen Waste Selling Requests", d: "Approve dry scrap pickups and schedule collection logistics" },
        'complaints-mgmt': { t: "Complaint Management", d: "Assign sanitary workers to clear overflowing trash bins" },
        'analytics-center': { t: "Analytics Trends", d: "Long term historical graph representation of circular efficiency" },
        'decision-support': { t: "AI Decision Support Recommendations", d: "Actionable heuristics and predictive warnings from AI models" },
        
        // Citizen Portal
        'citizen-dashboard': { t: "Citizen Home Portal", d: "Quick access to local smart bins status and garbage schedules" },
        'citizen-complaint': { t: "Overflow Complaint Submission", d: "File complaints and monitor clean up progress live" },
        'citizen-selling': { t: "Sell Recyclable Dry Waste", d: "Schedule pickups for plastic, newspapers, or metals for cashbacks" },
        'citizen-marketplace': { t: "Eco Products Marketplace", d: "Buy recycled notebooks, compost, or outdoor chairs with rewards" },
        'citizen-bot': { t: "AI Eco-Chatbot Assistant", d: "Instant chatbot guide for sorting guidelines and pickup statuses" }
    };
    
    if (info[tabId]) {
        title.textContent = info[tabId].t;
        desc.textContent = info[tabId].d;
    }
}

// Global router dispatch
function loadTabContent(tabId) {
    switch (tabId) {
        case 'admin-dashboard':
            loadAdminDashboard();
            break;
        case 'smart-bins':
            loadSmartBinsCenter();
            break;
        case 'waste-segregation':
            loadSegregationCenter();
            break;
        case 'recovery-advisor':
            loadRecoveryAdvisor();
            break;
        case 'circular-economy':
            loadCircularEconomy();
            break;
        case 'marketplace-mgmt':
            loadMarketplaceMgmt();
            break;
        case 'selling-requests':
            loadAdminSellingRequests();
            break;
        case 'complaints-mgmt':
            loadAdminComplaints();
            break;
        case 'analytics-center':
            loadAnalyticsCenter();
            break;
        case 'decision-support':
            loadDecisionLogs();
            break;
        case 'citizen-dashboard':
            loadCitizenDashboard();
            break;
        case 'citizen-complaint':
            loadCitizenComplaints();
            break;
        case 'citizen-selling':
            loadCitizenSelling();
            break;
        case 'citizen-marketplace':
            loadCitizenMarketplace();
            break;
        default:
            break;
    }
    // Update badge counts regularly
    updateSidebarBadges();
}

// Load notification counts
async function updateSidebarBadges() {
    try {
        const res = await fetch('/api/analytics');
        if (!res.ok) return;
        const data = await res.json();
        
        const badgeSell = document.getElementById('badgeSelling');
        const badgeComp = document.getElementById('badgeComplaints');
        
        if (badgeSell) {
            badgeSell.textContent = data.pending_selling;
            badgeSell.style.display = data.pending_selling > 0 ? 'inline-block' : 'none';
        }
        if (badgeComp) {
            badgeComp.textContent = data.pending_complaints;
            badgeComp.style.display = data.pending_complaints > 0 ? 'inline-block' : 'none';
        }
    } catch (err) {
        console.error(err);
    }
}

// Destroy helper to prevent Chart.js reuse errors
function destroyChart(name) {
    if (activeCharts[name]) {
        activeCharts[name].destroy();
        delete activeCharts[name];
    }
}

// ==================== ADMIN DASHBOARD ====================
async function loadAdminDashboard() {
    try {
        // Fetch KPIs
        const analyticsRes = await fetch('/api/analytics');
        const binsRes = await fetch('/api/bins');
        const historyRes = await fetch('/api/segregation/history');
        
        if (!analyticsRes.ok || !binsRes.ok || !historyRes.ok) throw new Error('Data fetch failed');
        
        const analytics = await analyticsRes.json();
        const bins = await binsRes.json();
        const audit = await historyRes.json();
        
        // Count online/offline bins
        const onlineCount = bins.filter(b => b.battery_percentage > 20).length;
        const offlineCount = bins.length - onlineCount;
        
        document.getElementById('kpiTotalBins').textContent = bins.length;
        document.getElementById('kpiOnlineBins').textContent = onlineCount;
        document.getElementById('kpiOfflineBins').textContent = offlineCount;
        document.getElementById('kpiTodayCollected').textContent = `${audit.total_collected_kg} kg`;
        
        document.getElementById('kpiComplaints').textContent = analytics.pending_complaints;
        document.getElementById('kpiSellingReqs').textContent = analytics.pending_selling;
        document.getElementById('kpiRevenue').textContent = `₹${analytics.revenue.toLocaleString()}`;
        
        // Derived environmental offsets
        const co2Saved = Math.round(audit.total_collected_kg * 0.95);
        document.getElementById('kpiCo2Saved').textContent = `${co2Saved} kg`;
        document.getElementById('kpiCircularScore').textContent = `${audit.circular_score_pct}%`;
        
        // Render collection trends chart
        destroyChart('dailyCollection');
        const ctxDaily = document.getElementById('dailyCollectionChart').getContext('2d');
        activeCharts['dailyCollection'] = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: analytics.collection_trend.labels,
                datasets: [{
                    label: 'Waste Collected (kg)',
                    data: analytics.collection_trend.weights,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#222B45' }, ticks: { color: '#8F9CAE' } },
                    y: { grid: { color: '#222B45' }, ticks: { color: '#8F9CAE' } }
                }
            }
        });

        // Render Composition breakdown chart
        destroyChart('compositionDonut');
        const ctxComp = document.getElementById('compositionDonutChart').getContext('2d');
        const compLabels = Object.keys(analytics.composition);
        const compWeights = Object.values(analytics.composition);
        
        activeCharts['compositionDonut'] = new Chart(ctxComp, {
            type: 'doughnut',
            data: {
                labels: compLabels,
                datasets: [{
                    data: compWeights,
                    backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'],
                    borderWidth: 1,
                    borderColor: '#151B2E'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#8F9CAE', boxWidth: 12, font: { size: 10 } }
                    }
                }
            }
        });
        
    } catch (err) {
        console.error('Error loading Admin dashboard metrics:', err);
    }
}

// ==================== MODULE 1: SMART BIN COLLECTION ====================
async function loadSmartBinsCenter() {
    try {
        const binsResponse = await fetch('/api/bins');
        const routesResponse = await fetch('/api/bins/routes');
        
        if (!binsResponse.ok || !routesResponse.ok) throw new Error('Data fetch failed');
        
        const bins = await binsResponse.json();
        const routeData = await routesResponse.json();
        
        // Populating Table
        const tbody = document.getElementById('binsTableBody');
        tbody.innerHTML = '';
        bins.forEach(b => {
            const row = document.createElement('tr');
            
            // Priority styling
            let priorityBadge = 'low';
            if (b.priority_score >= 80) priorityBadge = 'high';
            else if (b.priority_score >= 40) priorityBadge = 'medium';
            
            // Fill rating badge
            let fillBadge = 'low';
            if (b.fill_percentage >= 80) fillBadge = 'high';
            else if (b.fill_percentage >= 40) fillBadge = 'medium';
            
            row.innerHTML = `
                <td><strong>${b.id}</strong></td>
                <td>${b.location}</td>
                <td><span class="badge ${fillBadge}">${b.fill_percentage}%</span></td>
                <td>${b.battery_percentage}%</td>
                <td>${b.predicted_overflow_hours === 0 ? 'OVERFLOWING' : `in ${b.predicted_overflow_hours} Hours`}</td>
                <td><span class="badge ${priorityBadge}">${b.priority_score}</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="simulateInstantCollection('${b.id}', '${b.location}')" style="font-size:0.75rem; padding:0.25rem 0.5rem; width:auto;">
                        Force Empty
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Populating Routes List
        const routeTimeline = document.getElementById('routeTimeline');
        routeTimeline.innerHTML = '';
        
        const routeList = routeData.route;
        
        if (routeList.length === 0) {
            routeTimeline.innerHTML = `<p style="color:var(--text-secondary); text-align:center; padding:1.5rem 0;">All bins stable. No collection route needed today.</p>`;
        } else {
            routeList.forEach((stop, index) => {
                const item = document.createElement('div');
                item.className = 'timeline-item';
                if (stop.type === 'depot') item.classList.add('depot');
                else if (stop.type === 'station') item.classList.add('station');
                
                let descText = '';
                if (stop.type === 'depot') descText = 'Vehicle Dispatch Terminal';
                else if (stop.type === 'station') descText = 'Offload Sorting Center';
                else descText = `Fill Capacity: ${stop.fill_percentage}% • Priority: ${stop.priority_score}`;
                
                item.innerHTML = `
                    <div class="timeline-info">
                        <span class="timeline-title">${stop.id} (${stop.location})</span>
                        <span class="timeline-desc">Stop #${index + 1}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">${descText}</div>
                `;
                routeTimeline.appendChild(item);
            });
        }

        // Draw Map SVG
        drawSvgMap(bins, routeList);

        // Update Route Details
        document.getElementById('routeSavingsLabel').textContent = `${routeData.fuel_saved_liters}L fuel offset`;
        document.getElementById('routeStopsCount').textContent = `${routeData.bins_collected} Bins`;
        document.getElementById('routeEstTime').textContent = `${routeData.estimated_time_mins} Mins`;
        document.getElementById('routeCarbonSaved').textContent = `${routeData.co2_saved_kg} kg CO₂`;

    } catch (err) {
        console.error('Error loading smart bin collection center:', err);
    }
}

// Force-simulate bin empties from dashboard
async function simulateInstantCollection(binId, location) {
    const payload = {
        id: binId,
        fill_percentage: 0,
        battery_percentage: 100, // Recharges
        location: location
    };
    try {
        const response = await fetch('/api/bins/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            showToast(`Truck cleared ${binId} successfully!`);
            // Add a simulated waste collection history record so weights update
            loadSmartBinsCenter();
        }
    } catch (err) {
        console.error(err);
    }
}

// Programmatically draw vector layout representing routes
function drawSvgMap(allBins, routeList) {
    const svg = document.getElementById('mapSvg');
    svg.innerHTML = '';
    
    // Add grid lines for style
    for (let i = 20; i < 300; i += 40) {
        const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineH.setAttribute("x1", 0);
        lineH.setAttribute("y1", i);
        lineH.setAttribute("x2", 400);
        lineH.setAttribute("y2", i);
        lineH.setAttribute("stroke", "#1E293B");
        lineH.setAttribute("stroke-width", "0.5");
        svg.appendChild(lineH);
        
        const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineV.setAttribute("x1", i);
        lineV.setAttribute("y1", 0);
        lineV.setAttribute("x2", i);
        lineV.setAttribute("y2", 300);
        lineV.setAttribute("stroke", "#1E293B");
        lineV.setAttribute("stroke-width", "0.5");
        svg.appendChild(lineV);
    }

    // Map geographical coordinates (lat/long) into SVG viewport (350x260)
    // Coords scope: Lat 12.9600 to 12.9900, Long 77.5800 to 77.6500
    const latMin = 12.9580, latMax = 12.9880;
    const lonMin = 77.5750, lonMax = 77.6450;
    
    function scaleX(lon) {
        return 20 + ((lon - lonMin) / (lonMax - lonMin)) * 310;
    }
    function scaleY(lat) {
        return 240 - ((lat - latMin) / (latMax - latMin)) * 220; // Flip Y for screen coords
    }

    // Draw route polylines if route is active
    if (routeList.length > 1) {
        const pathPoints = routeList.map(stop => `${scaleX(stop.longitude)},${scaleY(stop.latitude)}`).join(' ');
        
        // Connecting Polyline
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", pathPoints);
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("stroke", "#3B82F6");
        polyline.setAttribute("stroke-width", "3");
        polyline.setAttribute("class", "map-path");
        svg.appendChild(polyline);
    }

    // Draw all bins
    allBins.forEach(b => {
        const x = scaleX(b.longitude);
        const y = scaleY(b.latitude);
        
        // Determine color
        let color = '#10B981'; // green
        if (b.fill_percentage >= 80) color = '#EF4444'; // red
        else if (b.fill_percentage >= 40) color = '#F59E0B'; // orange
        
        // Outer glow
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        glow.setAttribute("cx", x);
        glow.setAttribute("cy", y);
        glow.setAttribute("r", "10");
        glow.setAttribute("fill", color);
        glow.setAttribute("fill-opacity", "0.2");
        svg.appendChild(glow);

        // Core Pin Node
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", color);
        circle.setAttribute("stroke", "#FFFFFF");
        circle.setAttribute("stroke-width", "1.5");
        circle.setAttribute("class", "map-node");
        
        // Tooltip title
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${b.id} (${b.location}): ${b.fill_percentage}% Full`;
        circle.appendChild(title);
        
        svg.appendChild(circle);

        // Add label text
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + 10);
        text.setAttribute("y", y + 4);
        text.setAttribute("fill", "#8F9CAE");
        text.style.fontSize = "9px";
        text.style.fontWeight = "bold";
        text.textContent = b.id;
        svg.appendChild(text);
    });

    // Draw Depot & Station markers if route is active
    if (routeList.length > 0) {
        // Depot
        const dep = routeList[0];
        const depX = scaleX(dep.longitude);
        const depY = scaleY(dep.latitude);
        
        const depRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        depRect.setAttribute("x", depX - 7);
        depRect.setAttribute("y", depY - 7);
        depRect.setAttribute("width", "14");
        depRect.setAttribute("height", "14");
        depRect.setAttribute("fill", "#10B981");
        depRect.setAttribute("stroke", "#FFFFFF");
        depRect.setAttribute("stroke-width", "1.5");
        
        const dTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
        dTitle.textContent = "Depot: Start Terminal";
        depRect.appendChild(dTitle);
        svg.appendChild(depRect);
        
        // Station (End Stop)
        const st = routeList[routeList.length - 1];
        const stX = scaleX(st.longitude);
        const stY = scaleY(st.latitude);
        
        const stTri = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        stTri.setAttribute("points", `${stX},${stY-9} ${stX-8},${stY+7} ${stX+8},${stY+7}`);
        stTri.setAttribute("fill", "#EF4444");
        stTri.setAttribute("stroke", "#FFFFFF");
        stTri.setAttribute("stroke-width", "1.5");
        
        const sTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
        sTitle.textContent = "Recycling Station: Dumping Terminal";
        stTri.appendChild(sTitle);
        svg.appendChild(stTri);
    }
}

// ==================== MODULE 2: AI WASTE SEGREGATION ====================
function loadSegregationCenter() {
    updateAuditRecords();
}

async function updateAuditRecords() {
    try {
        const response = await fetch('/api/segregation/history');
        if (!response.ok) return;
        const data = await response.json();
        
        document.getElementById('auditTotalCollected').textContent = `${data.total_collected_kg.toLocaleString()} kg`;
        document.getElementById('auditRecovered').textContent = `${data.recovered_kg.toLocaleString()} kg`;
        document.getElementById('auditLandfill').textContent = `${data.landfill_kg.toLocaleString()} kg`;
        document.getElementById('auditRecoveryRate').textContent = `${data.circular_score_pct}%`;
    } catch (err) {
        console.error(err);
    }
}

// Segregation Conveyor scan simulation
function startSegregationSimulation() {
    const weightInput = document.getElementById('segregationInputWeight').value;
    const weight = parseFloat(weightInput);
    
    if (isNaN(weight) || weight <= 0) {
        alert("Please enter a valid weight!");
        return;
    }
    
    const laser = document.getElementById('scannerLaser');
    const item = document.getElementById('scannerItem');
    const status = document.getElementById('scannerStatus');
    const bins = ['binOrganic', 'binPlastic', 'binPaper', 'binMetal', 'binGlass'];
    
    // Reset highlights
    bins.forEach(id => document.getElementById(id).classList.remove('active'));
    
    // Start Laser animation
    laser.style.display = 'block';
    status.textContent = "Scanning mixed waste feedstock...";
    item.textContent = "🗑️";
    
    let timer = 0;
    const interval = setInterval(() => {
        // Rapid cycling simulation
        const icons = ["🍏", "🥤", "📄", "🔩", "🍾"];
        item.textContent = icons[timer % icons.length];
        
        // Random highlights to show scan active
        bins.forEach(id => document.getElementById(id).classList.remove('active'));
        const randomBin = bins[Math.floor(Math.random() * bins.length)];
        document.getElementById(randomBin).classList.add('active');
        
        timer++;
        if (timer >= 15) {
            clearInterval(interval);
            completeSegregationSimulation(weight);
        }
    }, 180);
}

async function completeSegregationSimulation(weight) {
    const laser = document.getElementById('scannerLaser');
    const item = document.getElementById('scannerItem');
    const status = document.getElementById('scannerStatus');
    
    laser.style.display = 'none';
    item.textContent = "✅";
    status.textContent = "Scan Complete! Classification complete.";
    
    // Highlight all bins
    document.querySelectorAll('.scanner-bin').forEach(b => b.classList.add('active'));
    
    try {
        const response = await fetch(`/api/segregation/predict?weight=${weight}`);
        if (!response.ok) throw new Error('Prediction API failed');
        const data = await response.json();
        
        // Render scan results bar chart
        destroyChart('segregationBar');
        const ctx = document.getElementById('segregationBarChart').getContext('2d');
        const labels = data.map(item => item.material);
        const weights = data.map(item => item.weight);
        
        activeCharts['segregationBar'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Classified Weight (kg)',
                    data: weights,
                    backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#8F9CAE' } },
                    y: { grid: { color: '#222B45' }, ticks: { color: '#8F9CAE' } }
                }
            }
        });
        
        showToast(`AI segregated ${weight}kg waste stream.`);
        
    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 3: RESOURCE RECOVERY ADVISOR ====================
async function loadRecoveryAdvisor() {
    try {
        const response = await fetch('/api/recovery/advisor');
        if (!response.ok) return;
        const data = await response.json();
        
        const tbody = document.getElementById('advisorTableBody');
        tbody.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${item.material}</strong></td>
                <td>${item.process}</td>
                <td><span class="badge low">${item.efficiency}%</span></td>
                <td>₹${item.cost_per_kg.toFixed(2)} / kg</td>
                <td><span style="color:var(--accent-green); font-weight:600;">${item.output}</span></td>
                <td>${item.destination}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 4: CIRCULAR ECONOMY CENTER ====================
function loadCircularEconomy() {
    runCircularEstimation();
}

async function runCircularEstimation() {
    const mat = document.getElementById('circularMaterial').value;
    const wt = parseFloat(document.getElementById('circularWeight').value);
    
    if (isNaN(wt) || wt <= 0) return;
    
    try {
        const response = await fetch(`/api/circular/estimate?material=${mat}&weight=${wt}`);
        if (!response.ok) return;
        const data = await response.json();
        
        // Update estimate layout
        document.getElementById('calcIntermediate').textContent = data.intermediate;
        document.getElementById('calcProduct').textContent = data.product;
        document.getElementById('calcUnits').textContent = `${data.units} Units`;
        document.getElementById('calcRevenue').textContent = `₹${data.revenue.toLocaleString()}`;
        
        // Fetch carbon savings metrics based on historical audit data
        const auditRes = await fetch('/api/segregation/history');
        if (!auditRes.ok) return;
        const audit = await auditRes.json();
        
        const fuelSaved = Math.round(audit.total_collected_kg * 0.08); // e.g. 0.08 L fuel saved per kg collected
        const co2Reduced = Math.round(fuelSaved * 2.68 + audit.recovered_kg * 1.8);
        const credits = (co2Reduced / 1000.0).toFixed(3);
        const trees = Math.round(co2Reduced / 22.0); // 22kg CO2 per tree per year
        
        document.getElementById('carbonFuelSaved').textContent = `${fuelSaved} Liters`;
        document.getElementById('carbonCo2Reduced').textContent = `${co2Reduced.toLocaleString()} kg`;
        document.getElementById('carbonCredits').textContent = `${credits} Credits`;
        document.getElementById('carbonTreesSaved').textContent = `${trees} Trees`;

    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 5: MARKETPLACE MANAGEMENT ====================
async function loadMarketplaceMgmt() {
    try {
        // Load products catalogue table
        const prodRes = await fetch('/api/marketplace/products');
        if (prodRes.ok) {
            const products = await prodRes.json();
            const tbody = document.getElementById('mgmtProductsTableBody');
            tbody.innerHTML = '';
            products.forEach(p => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${p.name}</strong></td>
                    <td>${p.category}</td>
                    <td>₹${p.price}</td>
                    <td>${p.stock} pcs</td>
                    <td>
                        <button class="btn btn-secondary" onclick="openEditProductModal(${p.id}, '${p.name}', '${p.category}', ${p.price}, ${p.stock}, '${p.description}')" style="font-size:0.75rem; padding:0.25rem 0.5rem; width:auto; display:inline-block; margin-right:0.25rem;">
                            Edit
                        </button>
                        <button class="btn btn-secondary" onclick="deleteProduct(${p.id})" style="font-size:0.75rem; padding:0.25rem 0.5rem; width:auto; display:inline-block; color:var(--accent-rose); border-color:rgba(239,68,68,0.2);">
                            Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        // Load incoming buyer orders
        const ordersRes = await fetch('/api/marketplace/orders');
        if (ordersRes.ok) {
            const orders = await ordersRes.json();
            const tbody = document.getElementById('mgmtOrdersTableBody');
            tbody.innerHTML = '';
            orders.forEach(o => {
                const row = document.createElement('tr');
                let statusBadge = 'low';
                if (o.status === 'Pending') statusBadge = 'medium';
                
                let actionBtn = '';
                if (o.status === 'Pending') {
                    actionBtn = `
                        <button class="btn" onclick="updateOrderStatus(${o.id}, 'Shipped')" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto;">
                            Ship Order
                        </button>
                    `;
                } else {
                    actionBtn = `<span style="font-size:0.75rem; color:var(--text-secondary);">Dispatched</span>`;
                }

                row.innerHTML = `
                    <td>ORD-${o.id}</td>
                    <td>${o.citizen_name}</td>
                    <td>${o.product_name}</td>
                    <td>${o.quantity}</td>
                    <td>₹${o.total_price}</td>
                    <td><span class="badge ${statusBadge}">${o.status}</span></td>
                    <td>${actionBtn}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

// Add/Edit Product Modal triggers
function openAddProductModal() {
    document.getElementById('productModalTitle').textContent = "Add Recycled Product";
    document.getElementById('crudProductId').value = "";
    document.getElementById('crudProductName').value = "";
    document.getElementById('crudProductCategory').value = "Chair";
    document.getElementById('crudProductPrice').value = "500";
    document.getElementById('crudProductStock').value = "20";
    document.getElementById('crudProductDesc').value = "";
    document.getElementById('productCrudModal').classList.add('active');
}

function openEditProductModal(id, name, cat, price, stock, desc) {
    document.getElementById('productModalTitle').textContent = "Edit Recycled Product";
    document.getElementById('crudProductId').value = id;
    document.getElementById('crudProductName').value = name;
    document.getElementById('crudProductCategory').value = cat;
    document.getElementById('crudProductPrice').value = price;
    document.getElementById('crudProductStock').value = stock;
    document.getElementById('crudProductDesc').value = desc;
    document.getElementById('productCrudModal').classList.add('active');
}

function closeProductModal() {
    document.getElementById('productCrudModal').classList.remove('active');
}

async function handleProductFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('crudProductId').value;
    const name = document.getElementById('crudProductName').value;
    const cat = document.getElementById('crudProductCategory').value;
    const price = parseFloat(document.getElementById('crudProductPrice').value);
    const stock = parseInt(document.getElementById('crudProductStock').value);
    const desc = document.getElementById('crudProductDesc').value;
    
    const payload = { name, category: cat, price, stock, description: desc };
    
    try {
        let response;
        if (id) {
            // Edit
            response = await fetch(`/api/marketplace/products/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Add
            response = await fetch('/api/marketplace/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        if (response.ok) {
            closeProductModal();
            showToast("Product catalogue updated!");
            loadMarketplaceMgmt();
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteProduct(id) {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
        const res = await fetch(`/api/marketplace/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Product deleted successfully.");
            loadMarketplaceMgmt();
        }
    } catch (err) {
        console.error(err);
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        const res = await fetch(`/api/marketplace/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            showToast("Order dispatched successfully.");
            loadMarketplaceMgmt();
        }
    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 6: CITIZEN SELLING REQUESTS (ADMIN) ====================
async function loadAdminSellingRequests() {
    try {
        const response = await fetch('/api/citizen/selling');
        if (!response.ok) return;
        const data = await response.json();
        
        const tbody = document.getElementById('adminSellingTableBody');
        tbody.innerHTML = '';
        data.forEach(r => {
            const row = document.createElement('tr');
            
            // Render state badges
            let statusBadge = 'low';
            if (r.status === 'Pending') statusBadge = 'medium';
            else if (r.status === 'Approved' || r.status === 'Pickup Scheduled') statusBadge = 'blue';
            
            // Workflow Actions buttons based on Status
            let actions = '';
            if (r.status === 'Pending') {
                actions = `
                    <button class="btn" onclick="updateSellingRequest(${r.id}, 'Approved')" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto; display:inline-block; margin-right:0.25rem;">
                        Approve
                    </button>
                    <button class="btn btn-secondary" onclick="updateSellingRequest(${r.id}, 'Rejected')" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto; display:inline-block; color:var(--accent-rose);">
                        Reject
                    </button>
                `;
            } else if (r.status === 'Approved') {
                actions = `
                    <button class="btn" onclick="assignVehicleSelling(${r.id})" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto;">
                        Assign Truck
                    </button>
                `;
            } else if (r.status === 'Vehicle Assigned' || r.status === 'Pickup Scheduled') {
                actions = `
                    <button class="btn" onclick="updateSellingRequest(${r.id}, 'Completed')" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto; background-color:var(--accent-green);">
                        Complete Pickup
                    </button>
                `;
            } else {
                actions = `<span style="font-size:0.75rem; color:var(--text-secondary);">Cycle Complete</span>`;
            }

            row.innerHTML = `
                <td>REQ-${r.id}</td>
                <td>${r.citizen_name}</td>
                <td><strong>${r.waste_type}</strong></td>
                <td>${r.weight} kg</td>
                <td>₹${r.estimated_price}</td>
                <td>${r.pickup_address}</td>
                <td>${r.preferred_date}</td>
                <td><span class="badge ${statusBadge}">${r.status}</span></td>
                <td>${r.assigned_vehicle || '-'}</td>
                <td>${actions}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

async function updateSellingRequest(reqId, status) {
    try {
        const res = await fetch(`/api/citizen/selling/${reqId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            showToast(`Request updated to ${status}`);
            loadAdminSellingRequests();
        }
    } catch (err) {
        console.error(err);
    }
}

function assignVehicleSelling(reqId) {
    const vehicle = prompt("Enter registration code of assigned logistics truck:", "Eco Truck-2");
    if (!vehicle) return;
    
    fetch(`/api/citizen/selling/${reqId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Vehicle Assigned', assigned_vehicle: vehicle })
    }).then(res => {
        if (res.ok) {
            showToast("Logistics truck assigned to routing path.");
            loadAdminSellingRequests();
        }
    });
}

// ==================== MODULE 7: COMPLAINT MANAGEMENT (ADMIN) ====================
async function loadAdminComplaints() {
    try {
        const response = await fetch('/api/citizen/complaints');
        if (!response.ok) return;
        const data = await response.json();
        
        const tbody = document.getElementById('adminComplaintsTableBody');
        tbody.innerHTML = '';
        data.forEach(c => {
            const row = document.createElement('tr');
            
            let statusBadge = 'low';
            if (c.status === 'Pending') statusBadge = 'high';
            else if (c.status === 'Assigned') statusBadge = 'medium';
            
            let actions = '';
            if (c.status === 'Pending') {
                actions = `
                    <button class="btn" onclick="assignComplaintStaff(${c.id})" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto;">
                        Assign Staff
                    </button>
                `;
            } else if (c.status === 'Assigned') {
                actions = `
                    <button class="btn" onclick="resolveComplaint(${c.id})" style="font-size:0.7rem; padding:0.25rem 0.4rem; width:auto; background-color:var(--accent-green);">
                        Resolve
                    </button>
                `;
            } else {
                actions = `<span style="font-size:0.75rem; color:var(--text-secondary);">Resolved</span>`;
            }

            row.innerHTML = `
                <td>CMP-${c.id}</td>
                <td>${c.citizen_name}</td>
                <td><strong>${c.complaint_type}</strong></td>
                <td>${c.location}</td>
                <td>${c.description}</td>
                <td>${c.created_at}</td>
                <td>${c.staff_assigned || '-'}</td>
                <td><span class="badge ${statusBadge}">${c.status}</span></td>
                <td>${actions}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

function assignComplaintStaff(compId) {
    const staff = prompt("Enter sanitary staff name to deploy to site location:", "Ramesh Kumar");
    if (!staff) return;
    
    fetch(`/api/citizen/complaints/${compId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Assigned', staff_assigned: staff })
    }).then(res => {
        if (res.ok) {
            showToast(`Dispatched crew: ${staff}`);
            loadAdminComplaints();
        }
    });
}

async function resolveComplaint(compId) {
    try {
        const res = await fetch(`/api/citizen/complaints/${compId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Resolved' })
        });
        if (res.ok) {
            showToast("Incident ticket resolved and closed.");
            loadAdminComplaints();
        }
    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 8: ANALYTICS TRENDS ====================
async function loadAnalyticsCenter() {
    try {
        const response = await fetch('/api/analytics');
        if (!response.ok) return;
        const data = await response.json();
        
        // Render Revenue Trends Chart
        destroyChart('revenueTrend');
        const ctxRev = document.getElementById('revenueTrendChart').getContext('2d');
        activeCharts['revenueTrend'] = new Chart(ctxRev, {
            type: 'bar',
            data: {
                labels: data.collection_trend.labels,
                datasets: [{
                    label: 'Market Revenue Yields (₹)',
                    data: data.collection_trend.weights.map(w => w * 85), // Mock revenue scaling
                    backgroundColor: '#10B981',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#8F9CAE' }, grid: { display: false } },
                    y: { ticks: { color: '#8F9CAE' }, grid: { color: '#222B45' } }
                }
            }
        });

        // Render Complaints Volume Trends Chart
        destroyChart('complaintsTrend');
        const ctxComp = document.getElementById('complaintsTrendChart').getContext('2d');
        activeCharts['complaintsTrend'] = new Chart(ctxComp, {
            type: 'line',
            data: {
                labels: data.collection_trend.labels,
                datasets: [{
                    label: 'Reported Overflow Incidents',
                    data: [3, 2, 4, 1, 0, 2, data.pending_complaints],
                    borderColor: '#EF4444',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#8F9CAE' }, grid: { display: false } },
                    y: { ticks: { color: '#8F9CAE' }, grid: { color: '#222B45' } }
                }
            }
        });
        
    } catch (err) {
        console.error(err);
    }
}

// ==================== MODULE 9: AI DECISION LOGS ====================
async function loadDecisionLogs() {
    try {
        const response = await fetch('/api/decision_support');
        if (!response.ok) return;
        const data = await response.json();
        
        const container = document.getElementById('decisionLogsContainer');
        container.innerHTML = '';
        
        data.forEach(log => {
            const item = document.createElement('div');
            item.style.padding = '1rem';
            item.style.border = '1px solid var(--border-color)';
            item.style.borderRadius = 'var(--border-radius)';
            item.style.backgroundColor = 'rgba(255,255,255,0.01)';
            
            let color = 'var(--accent-blue)';
            let icon = 'fa-circle-info';
            
            if (log.type === 'warning') {
                color = 'var(--accent-rose)';
                icon = 'fa-triangle-exclamation';
                item.style.borderLeft = '4px solid var(--accent-rose)';
            } else if (log.type === 'success') {
                color = 'var(--accent-green)';
                icon = 'fa-circle-check';
                item.style.borderLeft = '4px solid var(--accent-green)';
            } else {
                item.style.borderLeft = '4px solid var(--accent-blue)';
            }
            
            item.innerHTML = `
                <div class="flex-space-between" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem; color:${color}; font-weight:600;">
                        <i class="fa-solid ${icon}"></i>
                        <span>AI RECOMMENDATION</span>
                    </div>
                    <span>${log.created_at}</span>
                </div>
                <p style="font-size:0.9rem;">${log.message}</p>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        console.error(err);
    }
}

// ==================== CITIZEN PORTAL DASHBOARD ====================
async function loadCitizenDashboard() {
    try {
        const res = await fetch('/api/bins');
        if (!res.ok) return;
        const bins = await res.json();
        
        // Render Nearby Bins table
        const tbody = document.getElementById('citBinsTableBody');
        tbody.innerHTML = '';
        
        bins.slice(0, 3).forEach(b => {
            const row = document.createElement('tr');
            
            let fillBadge = 'low';
            if (b.fill_percentage >= 80) fillBadge = 'high';
            else if (b.fill_percentage >= 40) fillBadge = 'medium';
            
            row.innerHTML = `
                <td><strong>${b.id}</strong></td>
                <td>${b.location}</td>
                <td><span class="badge ${fillBadge}">${b.fill_percentage}%</span></td>
                <td>${b.fill_percentage >= 80 ? '⚠️ Overflow Warning' : '🟢 Ready for Use'}</td>
            `;
            tbody.appendChild(row);
        });
        
        // Fetch citizen selling to check rewards and upcoming collections
        const sellingRes = await fetch(`/api/citizen/selling?citizen=${currentUsername}`);
        if (sellingRes.ok) {
            const requests = await sellingRes.json();
            
            // Calculate total earnings
            const completed = requests.filter(r => r.status === 'Completed');
            const totalCash = completed.reduce((sum, r) => sum + r.estimated_price, 0);
            
            document.getElementById('citEarnings').textContent = `₹${totalCash.toLocaleString()}`;
            document.getElementById('citRewardPoints').textContent = `${completed.length * 30 + 50} pts`;
            
            // Check active pickups
            const scheduled = requests.find(r => r.status === 'Approved' || r.status === 'Vehicle Assigned');
            if (scheduled) {
                document.getElementById('citUpcomingPickups').textContent = `${scheduled.waste_type} on ${scheduled.preferred_date}`;
            } else {
                document.getElementById('citUpcomingPickups').textContent = "None Scheduled";
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// Citizen complaints
async function loadCitizenComplaints() {
    try {
        const res = await fetch(`/api/citizen/complaints?citizen=${currentUsername}`);
        if (!res.ok) return;
        const complaints = await res.json();
        
        const tbody = document.getElementById('citComplaintsTableBody');
        tbody.innerHTML = '';
        
        complaints.forEach(c => {
            const row = document.createElement('tr');
            
            let statusBadge = 'low';
            if (c.status === 'Pending') statusBadge = 'high';
            else if (c.status === 'Assigned') statusBadge = 'medium';
            
            row.innerHTML = `
                <td><strong>${c.complaint_type}</strong></td>
                <td>${c.location}</td>
                <td>${c.staff_assigned || 'Deploying Crew...'}</td>
                <td><span class="badge ${statusBadge}">${c.status}</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

async function submitComplaint(event) {
    event.preventDefault();
    
    const category = document.getElementById('compCategory').value;
    const location = document.getElementById('compLocation').value;
    const desc = document.getElementById('compDesc').value;
    
    const payload = {
        citizen_name: currentUsername,
        complaint_type: category,
        location: location,
        description: desc
    };
    
    try {
        const res = await fetch('/api/citizen/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast("Incident report filed successfully!");
            document.getElementById('compDesc').value = '';
            loadCitizenComplaints();
        }
    } catch (err) {
        console.error(err);
    }
}

// Citizen Waste Selling
function runCitPriceEstimation() {
    const type = document.getElementById('sellType').value;
    const weight = parseFloat(document.getElementById('sellWeight').value);
    
    if (isNaN(weight) || weight <= 0) return;
    
    const rates = { "Plastic": 25, "Paper": 8, "Metal": 60, "Organic": 3, "Glass": 15 };
    const est = rates[type] * weight;
    document.getElementById('sellEstimatedPrice').textContent = `₹${est.toLocaleString()}`;
}

async function loadCitizenSelling() {
    try {
        const res = await fetch(`/api/citizen/selling?citizen=${currentUsername}`);
        if (!res.ok) return;
        const requests = await res.json();
        
        const tbody = document.getElementById('citSellingTableBody');
        tbody.innerHTML = '';
        
        requests.forEach(r => {
            const row = document.createElement('tr');
            
            let badgeStyle = 'low';
            if (r.status === 'Pending') badgeStyle = 'medium';
            else if (r.status === 'Approved' || r.status === 'Vehicle Assigned') badgeStyle = 'blue';
            
            row.innerHTML = `
                <td><strong>${r.waste_type}</strong></td>
                <td>${r.weight} kg</td>
                <td>₹${r.estimated_price}</td>
                <td>${r.preferred_date}</td>
                <td>${r.assigned_vehicle || '-'}</td>
                <td><span class="badge ${badgeStyle}">${r.status}</span></td>
            `;
            tbody.appendChild(row);
        });
        runCitPriceEstimation();
    } catch (err) {
        console.error(err);
    }
}

async function submitSellingRequest(event) {
    event.preventDefault();
    
    const type = document.getElementById('sellType').value;
    const weight = parseFloat(document.getElementById('sellWeight').value);
    const address = document.getElementById('sellAddress').value;
    const date = document.getElementById('sellDate').value;
    
    const payload = {
        citizen_name: currentUsername,
        waste_type: type,
        weight: weight,
        pickup_address: address,
        preferred_date: date
    };
    
    try {
        const res = await fetch('/api/citizen/selling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast("Pickup collection scheduled successfully!");
            document.getElementById('sellAddress').value = '';
            document.getElementById('sellWeight').value = '10';
            loadCitizenSelling();
        }
    } catch (err) {
        console.error(err);
    }
}

// ==================== CITIZEN ECO-MARKETPLACE ====================
async function loadCitizenMarketplace() {
    try {
        // Load Catalog items
        const prodRes = await fetch('/api/marketplace/products');
        if (prodRes.ok) {
            const products = await prodRes.json();
            const grid = document.getElementById('marketCatalogGrid');
            grid.innerHTML = '';
            
            products.forEach(p => {
                const card = document.createElement('div');
                card.className = 'product-card';

                // Check stock
                const isDisabled = p.stock === 0 ? 'disabled' : '';
                const btnLabel = p.stock === 0 ? 'Out of Stock' : 'Add to Cart';
                const stockClass = p.stock === 0 ? 'stock-pill out' : (p.stock < 10 ? 'stock-pill low' : 'stock-pill');

                card.innerHTML = `
                    <div class="product-card-image">
                        <img src="${getProductImage(p.category)}" alt="${p.name}" loading="lazy">
                    </div>
                    <div class="product-card-body">
                        <h4 class="product-card-title">${p.name}</h4>
                        <p class="product-card-desc">${p.description}</p>
                        <div class="product-card-footer">
                            <div class="product-card-price-row">
                                <span class="product-card-price">₹${p.price}</span>
                                <span class="${stockClass}">${p.stock === 0 ? 'Out of stock' : p.stock + ' units left'}</span>
                            </div>
                            <button class="btn product-card-btn" ${isDisabled} onclick="addToCart(${p.id}, '${p.name}', ${p.price})">
                                <i class="fa-solid fa-cart-plus"></i> ${btnLabel}
                            </button>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        // Load Order history
        const ordersRes = await fetch(`/api/marketplace/orders?citizen=${currentUsername}`);
        if (ordersRes.ok) {
            const orders = await ordersRes.json();
            const tbody = document.getElementById('citOrdersTableBody');
            tbody.innerHTML = '';
            
            orders.forEach(o => {
                const row = document.createElement('tr');
                let badgeStyle = 'low';
                if (o.status === 'Pending') badgeStyle = 'medium';
                
                row.innerHTML = `
                    <td>ORD-${o.id}</td>
                    <td><strong>${o.product_name}</strong></td>
                    <td>${o.quantity}</td>
                    <td>₹${o.total_price}</td>
                    <td><span class="badge ${badgeStyle}">${o.status}</span></td>
                `;
                tbody.appendChild(row);
            });
        }

        renderCart();

    } catch (err) {
        console.error(err);
    }
}

function getProductImage(category) {
    // Image URLs are rendered server-side by Flask via url_for() in index.html
    // and stored in static/images/marketplace/. Falls back to the compost photo
    // if a category has no dedicated image yet.
    if (typeof MARKETPLACE_PRODUCT_IMAGES !== 'undefined' && MARKETPLACE_PRODUCT_IMAGES[category]) {
        return MARKETPLACE_PRODUCT_IMAGES[category];
    }
    return (typeof MARKETPLACE_PRODUCT_IMAGES !== 'undefined') ? Object.values(MARKETPLACE_PRODUCT_IMAGES)[0] : '';
}

// Shopping Cart operations
function addToCart(id, name, price) {
    const exists = shoppingCart.find(item => item.id === id);
    if (exists) {
        exists.qty++;
    } else {
        shoppingCart.push({ id, name, price, qty: 1 });
    }
    showToast(`${name} added to cart.`);
    renderCart();
}

function renderCart() {
    const list = document.getElementById('cartItemsList');
    list.innerHTML = '';
    
    if (shoppingCart.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:var(--text-secondary); font-size:0.85rem; padding:1.5rem 0;">Your cart is empty.</p>`;
        document.getElementById('cartTotalVal').textContent = '₹0';
        document.getElementById('cartCheckoutBtn').disabled = true;
        return;
    }
    
    let total = 0;
    shoppingCart.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <span><strong>${item.name}</strong> x ${item.qty}</span>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <span>₹${item.price * item.qty}</span>
                <i class="fa-solid fa-circle-minus cart-item-remove" onclick="removeFromCart(${index})"></i>
            </div>
        `;
        list.appendChild(row);
        total += item.price * item.qty;
    });
    
    document.getElementById('cartTotalVal').textContent = `₹${total}`;
    document.getElementById('cartCheckoutBtn').disabled = false;
}

function removeFromCart(index) {
    const item = shoppingCart[index];
    if (item.qty > 1) {
        item.qty--;
    } else {
        shoppingCart.splice(index, 1);
    }
    renderCart();
}

async function checkoutCart() {
    if (shoppingCart.length === 0) return;
    
    try {
        for (const item of shoppingCart) {
            const payload = {
                citizen_name: currentUsername,
                product_id: item.id,
                quantity: item.qty
            };
            
            const res = await fetch('/api/marketplace/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const data = await res.json();
                alert(`Order checkout error: ${data.message}`);
                return;
            }
        }
        
        showToast("Purchases checkout complete. Orders created!");
        shoppingCart = [];
        loadCitizenMarketplace();
        
    } catch (err) {
        console.error(err);
    }
}

// ==================== CITIZEN CHATBOT ====================
async function sendChatMsg(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const query = input.value.trim();
    if (!query) return;
    
    input.value = '';
    
    const messages = document.getElementById('chatMessages');
    
    // Append user message bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = query;
    messages.appendChild(userBubble);
    messages.scrollTop = messages.scrollHeight;
    
    try {
        const response = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, citizen: currentUsername })
        });
        if (!response.ok) throw new Error('Chatbot error');
        const data = await response.json();
        
        // Append bot bubble
        const botBubble = document.createElement('div');
        botBubble.className = 'chat-bubble bot';
        botBubble.innerHTML = data.reply.replace(/\n/g, '<br>');
        messages.appendChild(botBubble);
        messages.scrollTop = messages.scrollHeight;
        
    } catch (err) {
        console.error(err);
    }
}
