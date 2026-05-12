"use strict";
const INSTITUTION_CATEGORIES = {
    Wealthfront: ["High yield saving"],
    "Charles Schwab": ["Cash", "ETF", "Mutual Fund", "CD"],
    Fidelity: ["401k", "Roth", "Roth Investment"],
    Alight: ["HSA", "HSA Investment"],
};
const INSTITUTIONS = Object.keys(INSTITUTION_CATEGORIES);
const DEFAULT_INSTITUTION = "Charles Schwab";
const ACCOUNT_STYLE_CATEGORIES = ["High yield saving", "Cash", "401k", "Roth", "HSA"];
const MOVEMENT_CATEGORIES = ["High yield saving", "Cash", "401k", "Roth", "HSA"];
const NO_COST_BASIS_CATEGORIES = [];
const RETIREMENT_CATEGORIES = ["401k", "Roth", "Roth Investment", "HSA", "HSA Investment"];
const NON_RETIREMENT_SUMMARY_CATEGORIES = ["High yield saving", "Cash", "CD", "ETF"];
const state = {
    holdings: [],
    formMode: "new",
};
const elements = {
    dashboardTabButton: getElement("dashboardTabButton"),
    dataTabButton: getElement("dataTabButton"),
    dashboardPane: getElement("dashboardPane"),
    dataPane: getElement("dataPane"),
    form: getElement("holdingForm"),
    editingId: getElement("editingId"),
    month: getElement("month"),
    assetSelect: getElement("assetSelect"),
    assetSelectLabel: getElement("assetSelectLabel"),
    institution: getElement("institution"),
    category: getElement("category"),
    ticker: getElement("ticker"),
    currentValue: getElement("currentValue"),
    accountMovementPanel: getElement("accountMovementPanel"),
    previousBalance: getElement("previousBalance"),
    movementType: getElement("movementType"),
    movementAmount: getElement("movementAmount"),
    movementAmountLabel: getElement("movementAmountLabel"),
    currentValueIsUnrealizedGain: getElement("currentValueIsUnrealizedGain"),
    sold: getElement("sold"),
    costBasis: getElement("costBasis"),
    notes: getElement("notes"),
    addNewAsset: getElement("addNewAsset"),
    timeFrame: getElement("timeFrame"),
    allocationMetric: getElement("allocationMetric"),
    recordMonthFilter: getElement("recordMonthFilter"),
    recordInstitutionFilter: getElement("recordInstitutionFilter"),
    recordCategoryFilter: getElement("recordCategoryFilter"),
    recordTickerFilter: getElement("recordTickerFilter"),
    search: getElement("search"),
    totalValue: getElement("totalValue"),
    totalCost: getElement("totalCost"),
    totalGain: getElement("totalGain"),
    monthsTracked: getElement("monthsTracked"),
    allocationBars: getElement("allocationBars"),
    allAssetsTotalValue: getElement("allAssetsTotalValue"),
    allAssetsTotalCost: getElement("allAssetsTotalCost"),
    allAssetsTotalGain: getElement("allAssetsTotalGain"),
    allAssetsMonthsTracked: getElement("allAssetsMonthsTracked"),
    allAssetsBars: getElement("allAssetsBars"),
    retirementTotalValue: getElement("retirementTotalValue"),
    retirementTotalCost: getElement("retirementTotalCost"),
    retirementTotalGain: getElement("retirementTotalGain"),
    retirementMonthsTracked: getElement("retirementMonthsTracked"),
    retirementBars: getElement("retirementBars"),
    table: getElement("holdingsTable"),
    emptyState: getElement("emptyState"),
};
const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});
const preciseCurrency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
});
void init();
async function init() {
    populateInstitutions();
    populateCategories();
    setActiveTab("dashboard");
    elements.month.value = currentMonth();
    elements.dashboardTabButton.addEventListener("click", () => setActiveTab("dashboard"));
    elements.dataTabButton.addEventListener("click", () => setActiveTab("data"));
    elements.form.addEventListener("submit", saveHolding);
    elements.institution.addEventListener("change", () => populateCategories());
    elements.currentValue.addEventListener("input", syncSetBalanceAmount);
    elements.movementType.addEventListener("change", updateMovementAmount);
    elements.movementAmount.addEventListener("input", updateMovementAmount);
    elements.currentValueIsUnrealizedGain.addEventListener("change", updateCurrentValueBounds);
    elements.sold.addEventListener("change", updateSoldState);
    elements.assetSelect.addEventListener("change", prefillSelectedAsset);
    elements.addNewAsset.addEventListener("click", handleAssetModeButton);
    elements.timeFrame.addEventListener("change", render);
    elements.allocationMetric.addEventListener("change", render);
    elements.recordMonthFilter.addEventListener("change", render);
    elements.recordInstitutionFilter.addEventListener("change", render);
    elements.recordCategoryFilter.addEventListener("change", render);
    elements.recordTickerFilter.addEventListener("change", render);
    elements.search.addEventListener("input", render);
    await refreshHoldings();
}
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element #${id}`);
    }
    return element;
}
function populateInstitutions() {
    elements.institution.innerHTML = INSTITUTIONS.map((institution) => {
        return `<option value="${escapeHtml(institution)}">${escapeHtml(institution)}</option>`;
    }).join("");
}
function setActiveTab(tab) {
    const dashboardActive = tab === "dashboard";
    elements.dashboardPane.classList.toggle("hidden", !dashboardActive);
    elements.dataPane.classList.toggle("hidden", dashboardActive);
    elements.dashboardTabButton.classList.toggle("active", dashboardActive);
    elements.dataTabButton.classList.toggle("active", !dashboardActive);
    elements.dashboardTabButton.setAttribute("aria-selected", String(dashboardActive));
    elements.dataTabButton.setAttribute("aria-selected", String(!dashboardActive));
}
function populateCategories(selectedCategory) {
    const institution = elements.institution.value;
    const categories = INSTITUTION_CATEGORIES[institution] || [];
    elements.category.innerHTML = categories.map((category) => {
        return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
    }).join("");
    elements.category.value =
        selectedCategory && categories.includes(selectedCategory) ? selectedCategory : categories[0] || "";
    updateCostBasisVisibility(elements.category.value);
}
async function refreshHoldings() {
    const response = await fetchJson("/api/holdings");
    state.holdings = response.holdings;
    populateAssetSelect();
    populateRecordFilters();
    resetForm();
    render();
}
async function saveHolding(event) {
    event.preventDefault();
    const payload = {
        month: elements.month.value,
        institution: elements.institution.value,
        asset: selectedAssetKey(),
        category: elements.category.value,
        ticker: elements.ticker.value.trim(),
        currentValue: Number(elements.currentValue.value || 0),
        currentValueIsUnrealizedGain: elements.currentValueIsUnrealizedGain.checked,
        sold: elements.sold.checked,
        costBasis: Number(elements.costBasis.value || 0),
        notes: elements.notes.value.trim(),
    };
    if (payload.sold) {
        const saved = await saveConvertedAsset(payload);
        if (saved) {
            resetForm();
            await refreshHoldings();
        }
        return;
    }
    const saved = await savePayload(payload, elements.editingId.value || existingMonthlyHoldingId(payload));
    upsertLocalHolding(saved);
    resetForm();
    render();
}
async function savePayload(payload, id = "") {
    return id
        ? fetchJson(`/api/holdings/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        })
        : fetchJson("/api/holdings", {
            method: "POST",
            body: JSON.stringify(payload),
        });
}
async function saveConvertedAsset(payload) {
    if (!isAutoCashConversion(payload)) {
        alert("Cash generation is supported for Charles Schwab ETFs, Mutual Funds, and CDs marked Matured/Sold only.");
        return false;
    }
    const proceeds = payload.currentValue;
    const convertedPayload = {
        ...payload,
        currentValue: 0,
        currentValueIsUnrealizedGain: false,
        costBasis: 0,
        sold: true,
    };
    await savePayload(convertedPayload, elements.editingId.value || existingMonthlyHoldingId(convertedPayload));
    const cashPayload = {
        month: payload.month,
        institution: "Charles Schwab",
        asset: generateAssetKey("Charles Schwab", "Cash", "Settlement Cash", proceeds),
        category: "Cash",
        ticker: "Settlement Cash",
        currentValue: proceeds,
        currentValueIsUnrealizedGain: false,
        sold: false,
        costBasis: 0,
        notes: generatedCashNotes(payload),
    };
    await savePayload(cashPayload, existingMonthlyHoldingId(cashPayload));
    return true;
}
function isAutoCashConversion(payload) {
    if (payload.institution !== "Charles Schwab") {
        return false;
    }
    return ["ETF", "Mutual Fund", "CD"].includes(payload.category);
}
function generatedCashNotes(payload) {
    const action = payload.category === "CD" ? "matured" : "sold";
    const source = payload.ticker || payload.category;
    return payload.notes ? `Generated from ${action} ${source}. ${payload.notes}` : `Generated from ${action} ${source}.`;
}
function upsertLocalHolding(saved) {
    const existingIndex = state.holdings.findIndex((holding) => holding.id === saved.id);
    if (existingIndex >= 0) {
        state.holdings[existingIndex] = saved;
    }
    else {
        state.holdings.push(saved);
    }
}
function resetForm() {
    elements.form.reset();
    elements.editingId.value = "";
    elements.month.value = currentMonth();
    populateAssetSelect();
    setFormMode(state.holdings.length ? "existing" : "new");
    if (state.formMode === "existing") {
        prefillSelectedAsset();
    }
    else {
        elements.institution.value = DEFAULT_INSTITUTION;
        populateCategories();
        hideAccountMovement();
        updateCurrentValueBounds();
    }
}
function startNewAsset() {
    elements.form.reset();
    elements.editingId.value = "";
    elements.month.value = currentMonth();
    elements.currentValue.value = "";
    elements.currentValueIsUnrealizedGain.checked = false;
    elements.sold.checked = false;
    updateCurrentValueBounds();
    elements.institution.value = DEFAULT_INSTITUTION;
    populateCategories();
    setFormMode("new");
    hideAccountMovement();
    elements.ticker.focus();
}
function setFormMode(mode) {
    state.formMode = mode;
    const useExisting = mode === "existing";
    const isEdit = mode === "edit";
    elements.assetSelectLabel.classList.toggle("hidden", !useExisting);
    elements.assetSelect.required = useExisting;
    elements.addNewAsset.textContent = mode === "new" && state.holdings.length ? "Use Existing Asset" : "Add New Asset";
    elements.month.value = mode === "edit" ? elements.month.value : currentMonth();
    elements.institution.disabled = useExisting;
    elements.category.disabled = useExisting;
    elements.ticker.readOnly = useExisting;
    elements.costBasis.readOnly = false;
    elements.notes.readOnly = useExisting;
    elements.assetSelect.disabled = isEdit;
    if (!useExisting) {
        hideAccountMovement();
    }
}
function handleAssetModeButton() {
    if (state.formMode === "new") {
        resetForm();
        return;
    }
    startNewAsset();
}
function populateAssetSelect() {
    const assets = latestAssets();
    elements.assetSelect.innerHTML = assets.length
        ? assets
            .map((holding) => {
            return `<option value="${holding.id}">${escapeHtml(assetOptionLabel(holding))}</option>`;
        })
            .join("")
        : `<option value="">No assets entered yet</option>`;
}
function prefillSelectedAsset() {
    const holding = state.holdings.find((item) => item.id === elements.assetSelect.value);
    if (!holding)
        return;
    elements.editingId.value = "";
    elements.month.value = currentMonth();
    elements.institution.value = holding.institution;
    populateCategories(holding.category);
    elements.ticker.value = holding.ticker;
    elements.currentValue.value = "";
    elements.costBasis.value = String(holding.costBasis || 0);
    updateCostBasisVisibility(holding.category);
    elements.costBasis.readOnly = false;
    elements.currentValueIsUnrealizedGain.checked = holding.currentValueIsUnrealizedGain;
    elements.sold.checked = false;
    updateCurrentValueBounds();
    setupAccountMovement(holding);
    elements.notes.value = holding.notes;
}
function selectedAssetKey() {
    if (state.formMode === "existing") {
        const holding = state.holdings.find((item) => item.id === elements.assetSelect.value);
        return holding ? canonicalAssetKey(holding) : "";
    }
    return generateAssetKey(elements.institution.value, elements.category.value, elements.ticker.value, Number(elements.costBasis.value || 0));
}
function existingMonthlyHoldingId(payload) {
    return (state.holdings.find((holding) => holding.month === payload.month && canonicalAssetKey(holding) === payload.asset)?.id || "");
}
function latestAssets() {
    const latestByAsset = new Map();
    [...state.holdings].sort(sortByMonthDesc).forEach((holding) => {
        const key = canonicalAssetKey(holding);
        if (!latestByAsset.has(key)) {
            latestByAsset.set(key, holding);
        }
    });
    return [...latestByAsset.values()]
        .filter((holding) => !holding.sold)
        .sort((a, b) => {
        return a.institution.localeCompare(b.institution) || a.category.localeCompare(b.category) || a.ticker.localeCompare(b.ticker);
    });
}
function assetOptionLabel(holding) {
    const product = holding.ticker ? ` - ${holding.ticker}` : "";
    const basis = isAccountStyleCategory(holding.category) ? "" : ` - ${preciseCurrency.format(holding.costBasis || 0)}`;
    return `${holding.institution} - ${holding.category}${product}${basis}`;
}
function render() {
    const dashboardHoldings = getDashboardHoldings();
    const retirementHoldings = dashboardHoldings.filter((holding) => isRetirementCategory(holding.category));
    renderSummary(dashboardHoldings);
    renderAllAssets(dashboardHoldings);
    renderRetirement(retirementHoldings);
    renderTable(getRecordHoldings());
}
function getDashboardHoldings() {
    const frame = elements.timeFrame.value;
    let holdings = [...state.holdings].sort(sortByMonthDesc);
    if (frame === "latest") {
        const latest = holdings[0]?.month;
        holdings = latest ? holdings.filter((holding) => holding.month === latest) : [];
    }
    else if (frame !== "all") {
        const months = uniqueMonths(holdings).slice(0, Number(frame));
        holdings = holdings.filter((holding) => months.includes(holding.month));
    }
    return holdings;
}
function getRecordHoldings() {
    const query = elements.search.value.trim().toLowerCase();
    let holdings = [...state.holdings].sort(sortByMonthDesc);
    const month = elements.recordMonthFilter.value;
    const institution = elements.recordInstitutionFilter.value;
    const category = elements.recordCategoryFilter.value;
    const ticker = elements.recordTickerFilter.value;
    if (month)
        holdings = holdings.filter((holding) => holding.month === month);
    if (institution)
        holdings = holdings.filter((holding) => holding.institution === institution);
    if (category)
        holdings = holdings.filter((holding) => holding.category === category);
    if (ticker)
        holdings = holdings.filter((holding) => (holding.ticker || "") === ticker);
    if (query) {
        holdings = holdings.filter((holding) => {
            return [
                holding.currentValueIsUnrealizedGain ? "unrealized gain" : "current value",
                holding.sold ? "sold" : "active",
                holding.notes,
            ]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }
    return holdings;
}
function populateRecordFilters() {
    setFilterOptions(elements.recordMonthFilter, uniqueMonths(state.holdings), "All Months");
    setFilterOptions(elements.recordInstitutionFilter, uniqueValues(state.holdings, "institution"), "All Institutions");
    setFilterOptions(elements.recordCategoryFilter, uniqueValues(state.holdings, "category"), "All Categories");
    setFilterOptions(elements.recordTickerFilter, uniqueTickers(state.holdings), "All Tickers/Products");
}
function setFilterOptions(select, values, allLabel) {
    const currentValue = select.value;
    select.innerHTML = [
        `<option value="">${escapeHtml(allLabel)}</option>`,
        ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "-")}</option>`),
    ].join("");
    select.value = values.includes(currentValue) ? currentValue : "";
}
function uniqueValues(holdings, key) {
    return [...new Set(holdings.map((holding) => holding[key]))].sort((a, b) => a.localeCompare(b));
}
function uniqueTickers(holdings) {
    return [...new Set(holdings.map((holding) => holding.ticker || ""))].sort((a, b) => a.localeCompare(b));
}
function renderSummary(holdings) {
    const allocationHoldings = holdings.filter((holding) => isNonRetirementSummaryCategory(holding.category));
    const metric = elements.allocationMetric.value;
    const groups = groupHoldings(allocationHoldings, "category", metric);
    const allocationTotal = groups.reduce((total, group) => total + group.value, 0);
    renderMetricRow({
        holdings: allocationHoldings,
        totalValue: elements.totalValue,
        totalCost: elements.totalCost,
        totalGain: elements.totalGain,
        monthsTracked: elements.monthsTracked,
    });
    if (!allocationHoldings.length || !groups.length) {
        elements.allocationBars.innerHTML = elements.emptyState.innerHTML;
        return;
    }
    elements.allocationBars.innerHTML = groups
        .map((group, index) => {
        const percent = allocationTotal ? (group.value / allocationTotal) * 100 : 0;
        const width = Math.max(0, Math.min(100, percent));
        return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(group.name)}</strong>
            <span>${currency.format(group.value)}</span>
            <span>${percent.toFixed(1)}%</span>
          </div>
          <div class="bar-track" aria-label="${escapeHtml(group.name)} ${percent.toFixed(1)}%">
            <div class="bar-fill" style="width: ${width}%; background: ${barColor(index)}"></div>
          </div>
        </div>
      `;
    })
        .join("");
}
function renderAllAssets(holdings) {
    const metric = elements.allocationMetric.value;
    const groups = groupHoldings(holdings, "category", metric);
    const allocationTotal = groups.reduce((total, group) => total + group.value, 0);
    renderMetricRow({
        holdings,
        totalValue: elements.allAssetsTotalValue,
        totalCost: elements.allAssetsTotalCost,
        totalGain: elements.allAssetsTotalGain,
        monthsTracked: elements.allAssetsMonthsTracked,
    });
    if (!holdings.length || !groups.length) {
        elements.allAssetsBars.innerHTML = elements.emptyState.innerHTML;
        return;
    }
    elements.allAssetsBars.innerHTML = groups
        .map((group, index) => {
        const percent = allocationTotal ? (group.value / allocationTotal) * 100 : 0;
        const width = Math.max(0, Math.min(100, percent));
        return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(group.name)}</strong>
            <span>${currency.format(group.value)}</span>
            <span>${percent.toFixed(1)}%</span>
          </div>
          <div class="bar-track" aria-label="${escapeHtml(group.name)} ${percent.toFixed(1)}%">
            <div class="bar-fill" style="width: ${width}%; background: ${barColor(index)}"></div>
          </div>
        </div>
      `;
    })
        .join("");
}
function renderRetirement(holdings) {
    const groups = groupHoldings(holdings, "category", "currentValue");
    const allocationTotal = groups.reduce((total, group) => total + group.value, 0);
    renderMetricRow({
        holdings,
        totalValue: elements.retirementTotalValue,
        totalCost: elements.retirementTotalCost,
        totalGain: elements.retirementTotalGain,
        monthsTracked: elements.retirementMonthsTracked,
    });
    if (!holdings.length || !groups.length) {
        elements.retirementBars.innerHTML = elements.emptyState.innerHTML;
        return;
    }
    elements.retirementBars.innerHTML = groups
        .map((group, index) => {
        const percent = allocationTotal ? (group.value / allocationTotal) * 100 : 0;
        const width = Math.max(0, Math.min(100, percent));
        return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(group.name)}</strong>
            <span>${currency.format(group.value)}</span>
            <span>${percent.toFixed(1)}%</span>
          </div>
          <div class="bar-track" aria-label="${escapeHtml(group.name)} ${percent.toFixed(1)}%">
            <div class="bar-fill" style="width: ${width}%; background: ${barColor(index)}"></div>
          </div>
        </div>
      `;
    })
        .join("");
}
function renderTable(holdings) {
    if (!holdings.length) {
        elements.table.innerHTML = `
      <tr>
        <td colspan="10">${elements.emptyState.innerHTML}</td>
      </tr>
    `;
        return;
    }
    elements.table.innerHTML = holdings
        .map((holding) => {
        return `
        <tr>
          <td>${escapeHtml(holding.month)}</td>
          <td>${escapeHtml(holding.institution)}</td>
          <td>${escapeHtml(holding.category)}</td>
          <td>${escapeHtml(holding.ticker || "-")}</td>
          <td class="number">${preciseCurrency.format(holding.currentValue)}</td>
          <td>${holding.currentValueIsUnrealizedGain ? "Unrealized Gain" : "Current Value"}</td>
          <td>${holding.sold ? "Yes" : "No"}</td>
          <td class="number">${preciseCurrency.format(holding.costBasis || 0)}</td>
          <td>${escapeHtml(holding.notes || "-")}</td>
          <td>
            <div class="actions">
              <button class="link-button" type="button" data-action="edit" data-id="${holding.id}">Edit</button>
              <button class="link-button danger" type="button" data-action="delete" data-id="${holding.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
        .join("");
    elements.table.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", handleTableAction);
    });
}
async function handleTableAction(event) {
    const target = event.currentTarget;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const holding = state.holdings.find((item) => item.id === id);
    if (!holding || !id)
        return;
    if (action === "edit") {
        setFormMode("edit");
        elements.editingId.value = holding.id;
        elements.month.value = holding.month;
        elements.institution.value = holding.institution;
        populateCategories(holding.category);
        elements.ticker.value = holding.ticker;
        elements.currentValue.value = String(holding.currentValue);
        elements.currentValueIsUnrealizedGain.checked = holding.currentValueIsUnrealizedGain;
        elements.sold.checked = holding.sold;
        updateCurrentValueBounds();
        elements.costBasis.value = String(holding.costBasis || 0);
        updateCostBasisVisibility(holding.category);
        elements.costBasis.readOnly = false;
        setupAccountMovement(holding);
        elements.notes.value = holding.notes;
        elements.institution.focus();
    }
    if (action === "delete" && confirm("Delete this holding?")) {
        await fetchJson(`/api/holdings/${encodeURIComponent(id)}`, { method: "DELETE" });
        state.holdings = state.holdings.filter((item) => item.id !== id);
        render();
    }
}
function groupHoldings(holdings, key, metric) {
    const map = new Map();
    holdings.forEach((holding) => {
        const name = holding[key] || "Unspecified";
        const current = map.get(name) || { name, value: 0 };
        current.value += holding[metric] || 0;
        map.set(name, current);
    });
    return [...map.values()]
        .filter((group) => group.value !== 0)
        .sort((a, b) => b.value - a.value);
}
async function fetchJson(url, init = {}) {
    const response = await fetch(url, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    const payload = (await response.json());
    if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
    }
    return payload;
}
function currentMonth() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}
function uniqueMonths(holdings) {
    return [...new Set(holdings.map((holding) => holding.month))].sort().reverse();
}
function sum(holdings, key) {
    return holdings.reduce((total, holding) => total + Number(holding[key] || 0), 0);
}
function renderMetricRow({ holdings, totalValue, totalCost, totalGain, monthsTracked, }) {
    const cost = sum(holdings, "costBasis");
    const gain = sum(holdings, "currentValue") - cost;
    totalValue.textContent = currency.format(sum(holdings, "currentValue"));
    totalCost.textContent = currency.format(cost);
    totalGain.textContent = currency.format(gain);
    totalGain.style.color = gain < 0 ? "var(--danger)" : "var(--primary)";
    monthsTracked.textContent = String(uniqueMonths(holdings).length);
}
function sortByMonthDesc(a, b) {
    return b.month.localeCompare(a.month) || a.institution.localeCompare(b.institution);
}
function barColor(index) {
    const colors = ["#5b8cff", "#f0b35b", "#7aa2ff", "#d87fd3", "#55c7d9", "#ff7d8a"];
    return colors[index % colors.length];
}
function generateAssetKey(institution, category, ticker, costBasis) {
    const parts = isAccountStyleCategory(category)
        ? [institution, category, ticker || "No ticker"]
        : [institution, category, ticker || "No ticker", costBasis.toFixed(2)];
    return parts.map(keyPart).join("_");
}
function canonicalAssetKey(holding) {
    return generateAssetKey(holding.institution, holding.category, holding.ticker, holding.costBasis || 0);
}
function isAccountStyleCategory(category) {
    return ACCOUNT_STYLE_CATEGORIES.includes(category);
}
function isNoCostBasisCategory(category) {
    return NO_COST_BASIS_CATEGORIES.includes(category);
}
function isRetirementCategory(category) {
    return RETIREMENT_CATEGORIES.includes(category);
}
function isNonRetirementSummaryCategory(category) {
    return NON_RETIREMENT_SUMMARY_CATEGORIES.includes(category);
}
function updateCostBasisVisibility(category) {
    elements.costBasis.closest("label")?.classList.remove("hidden");
}
function updateCurrentValueBounds() {
    if (elements.currentValueIsUnrealizedGain.checked) {
        elements.currentValue.removeAttribute("min");
        return;
    }
    elements.currentValue.min = "0";
}
function updateSoldState() {
    if (elements.sold.checked) {
        elements.currentValueIsUnrealizedGain.checked = false;
    }
    updateCurrentValueBounds();
}
function setupAccountMovement(holding) {
    if (!isMovementCategory(holding.category) || !["existing", "edit"].includes(state.formMode)) {
        hideAccountMovement();
        return;
    }
    elements.accountMovementPanel.classList.remove("hidden");
    elements.previousBalance.textContent = preciseCurrency.format(holding.currentValue || 0);
    elements.movementType.value = "set";
    elements.movementAmount.value = "";
    elements.movementAmountLabel.classList.add("hidden");
    elements.currentValue.readOnly = false;
    elements.currentValue.placeholder = "Enter new balance";
    elements.notes.readOnly = false;
}
function hideAccountMovement() {
    elements.accountMovementPanel.classList.add("hidden");
    elements.previousBalance.textContent = preciseCurrency.format(0);
    elements.movementType.value = "set";
    elements.movementAmount.value = "";
    elements.movementAmountLabel.classList.add("hidden");
    elements.currentValue.readOnly = false;
    elements.currentValue.placeholder = "";
    elements.notes.readOnly = state.formMode === "existing";
}
function updateMovementAmount() {
    if (elements.accountMovementPanel.classList.contains("hidden")) {
        return;
    }
    const movement = elements.movementType.value;
    elements.movementAmountLabel.classList.toggle("hidden", movement === "set");
    elements.currentValue.readOnly = movement !== "set";
    if (movement === "set") {
        return;
    }
    const holding = movementBaseHolding();
    if (!holding)
        return;
    const amount = Number(elements.movementAmount.value || 0);
    const nextValue = movement === "add" ? holding.currentValue + amount : Math.max(0, holding.currentValue - amount);
    elements.currentValue.value = nextValue.toFixed(2);
}
function syncSetBalanceAmount() {
    if (elements.movementType.value === "set") {
        return;
    }
    updateMovementAmount();
}
function isMovementCategory(category) {
    return MOVEMENT_CATEGORIES.includes(category);
}
function movementBaseHolding() {
    const id = state.formMode === "edit" ? elements.editingId.value : elements.assetSelect.value;
    return state.holdings.find((item) => item.id === id);
}
function keyPart(value) {
    return value.trim().replace(/\s+/g, "-").replace(/_+/g, "-") || "None";
}
function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
