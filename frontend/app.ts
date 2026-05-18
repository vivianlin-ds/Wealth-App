type Institution = "Wealthfront" | "Charles Schwab" | "Fidelity" | "Alight";
type Category =
  | "High yield saving"
  | "Cash"
  | "ETF"
  | "Mutual Fund"
  | "CD"
  | "Equities"
  | "401k"
  | "Roth"
  | "Roth Investment"
  | "HSA"
  | "HSA Investment";

type Holding = {
  id: string;
  month: string;
  institution: Institution;
  asset: string;
  category: Category;
  ticker: string;
  currentValue: number;
  currentValueIsUnrealizedGain: boolean;
  sold: boolean;
  costBasis: number;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

type HoldingPayload = Omit<Holding, "id" | "createdAt" | "updatedAt">;
type ActivityRecord = {
  id: string;
  month: string;
  action: string;
  institution: Institution;
  category: Category;
  ticker: string;
  amount: number;
  cashDelta: number;
  notes: string;
  holdingId: string;
  createdAt: string;
};
type ActivityRecordPayload = Omit<ActivityRecord, "id" | "createdAt">;
type TimeFrame = "latest" | "3" | "6" | "12" | "all";
type FormMode = "existing" | "new" | "edit";
type AllocationMetric = "currentValue" | "costBasis";
type MovementType = "set" | "add" | "withdraw";
type CashAccount = {
  institution: Institution;
  category: Category;
  ticker: string;
  label: string;
};

const INSTITUTION_CATEGORIES: Record<Institution, Category[]> = {
  Wealthfront: ["High yield saving"],
  "Charles Schwab": ["Cash", "ETF", "Mutual Fund", "CD", "Equities"],
  Fidelity: ["401k", "Roth", "Roth Investment"],
  Alight: ["HSA", "HSA Investment"],
};

const INSTITUTIONS = Object.keys(INSTITUTION_CATEGORIES) as Institution[];
const DEFAULT_INSTITUTION: Institution = "Charles Schwab";
const ACCOUNT_STYLE_CATEGORIES: Category[] = ["High yield saving", "Cash", "401k", "Roth", "HSA"];
const MOVEMENT_CATEGORIES: Category[] = ["High yield saving", "Cash", "401k", "Roth", "HSA"];
const NO_COST_BASIS_CATEGORIES: Category[] = [];
const RETIREMENT_CATEGORIES: Category[] = ["401k", "Roth", "Roth Investment", "HSA", "HSA Investment"];
const NON_RETIREMENT_SUMMARY_CATEGORIES: Category[] = ["High yield saving", "Cash", "CD", "ETF", "Equities"];
const CASH_TRANSFER_ACCOUNTS: CashAccount[] = [
  { institution: "Charles Schwab", category: "Cash", ticker: "", label: "Charles Schwab - Cash" },
  { institution: "Wealthfront", category: "High yield saving", ticker: "HYSA", label: "Wealthfront - High yield saving" },
];

const state: { holdings: Holding[]; records: ActivityRecord[]; formMode: FormMode } = {
  holdings: [],
  records: [],
  formMode: "new",
};

const elements = {
  dashboardTabButton: getElement<HTMLButtonElement>("dashboardTabButton"),
  dataTabButton: getElement<HTMLButtonElement>("dataTabButton"),
  dashboardPane: getElement<HTMLElement>("dashboardPane"),
  dataPane: getElement<HTMLElement>("dataPane"),
  form: getElement<HTMLFormElement>("holdingForm"),
  transferPanel: getElement<HTMLElement>("transferPanel"),
  transferForm: getElement<HTMLFormElement>("transferForm"),
  editingId: getElement<HTMLInputElement>("editingId"),
  month: getElement<HTMLInputElement>("month"),
  assetSelect: getElement<HTMLSelectElement>("assetSelect"),
  assetSelectLabel: getElement<HTMLElement>("assetSelectLabel"),
  institution: getElement<HTMLSelectElement>("institution"),
  category: getElement<HTMLSelectElement>("category"),
  ticker: getElement<HTMLInputElement>("ticker"),
  currentValue: getElement<HTMLInputElement>("currentValue"),
  accountMovementPanel: getElement<HTMLElement>("accountMovementPanel"),
  previousBalance: getElement<HTMLElement>("previousBalance"),
  movementType: getElement<HTMLSelectElement>("movementType"),
  movementAmount: getElement<HTMLInputElement>("movementAmount"),
  movementAmountLabel: getElement<HTMLElement>("movementAmountLabel"),
  currentValueIsUnrealizedGain: getElement<HTMLInputElement>("currentValueIsUnrealizedGain"),
  sold: getElement<HTMLInputElement>("sold"),
  costBasis: getElement<HTMLInputElement>("costBasis"),
  notes: getElement<HTMLTextAreaElement>("notes"),
  transferMonth: getElement<HTMLInputElement>("transferMonth"),
  transferFrom: getElement<HTMLSelectElement>("transferFrom"),
  transferTo: getElement<HTMLSelectElement>("transferTo"),
  transferAmount: getElement<HTMLInputElement>("transferAmount"),
  transferNotes: getElement<HTMLTextAreaElement>("transferNotes"),
  addNewAsset: getElement<HTMLButtonElement>("addNewAsset"),
  transferCashButton: getElement<HTMLButtonElement>("transferCashButton"),
  closeTransferButton: getElement<HTMLButtonElement>("closeTransferButton"),
  timeFrame: getElement<HTMLSelectElement>("timeFrame"),
  allocationMetric: getElement<HTMLSelectElement>("allocationMetric"),
  recordMonthFilter: getElement<HTMLSelectElement>("recordMonthFilter"),
  recordInstitutionFilter: getElement<HTMLSelectElement>("recordInstitutionFilter"),
  recordCategoryFilter: getElement<HTMLSelectElement>("recordCategoryFilter"),
  recordTickerFilter: getElement<HTMLSelectElement>("recordTickerFilter"),
  search: getElement<HTMLInputElement>("search"),
  totalValue: getElement<HTMLElement>("totalValue"),
  totalCost: getElement<HTMLElement>("totalCost"),
  totalGain: getElement<HTMLElement>("totalGain"),
  monthsTracked: getElement<HTMLElement>("monthsTracked"),
  allocationBars: getElement<HTMLElement>("allocationBars"),
  allAssetsTotalValue: getElement<HTMLElement>("allAssetsTotalValue"),
  allAssetsTotalCost: getElement<HTMLElement>("allAssetsTotalCost"),
  allAssetsTotalGain: getElement<HTMLElement>("allAssetsTotalGain"),
  allAssetsMonthsTracked: getElement<HTMLElement>("allAssetsMonthsTracked"),
  allAssetsBars: getElement<HTMLElement>("allAssetsBars"),
  retirementTotalValue: getElement<HTMLElement>("retirementTotalValue"),
  retirementTotalCost: getElement<HTMLElement>("retirementTotalCost"),
  retirementTotalGain: getElement<HTMLElement>("retirementTotalGain"),
  retirementMonthsTracked: getElement<HTMLElement>("retirementMonthsTracked"),
  retirementBars: getElement<HTMLElement>("retirementBars"),
  table: getElement<HTMLTableSectionElement>("holdingsTable"),
  emptyState: getElement<HTMLTemplateElement>("emptyState"),
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

async function init(): Promise<void> {
  populateInstitutions();
  populateCategories();
  setActiveTab("dashboard");
  elements.month.value = currentMonth();
  elements.transferMonth.value = currentMonth();
  elements.dashboardTabButton.addEventListener("click", () => setActiveTab("dashboard"));
  elements.dataTabButton.addEventListener("click", () => setActiveTab("data"));
  elements.form.addEventListener("submit", saveHolding);
  elements.transferForm.addEventListener("submit", saveCashTransfer);
  elements.institution.addEventListener("change", () => populateCategories());
  elements.currentValue.addEventListener("input", syncSetBalanceAmount);
  elements.movementType.addEventListener("change", updateMovementAmount);
  elements.movementAmount.addEventListener("input", updateMovementAmount);
  elements.currentValueIsUnrealizedGain.addEventListener("change", updateCurrentValueBounds);
  elements.sold.addEventListener("change", updateSoldState);
  elements.assetSelect.addEventListener("change", prefillSelectedAsset);
  elements.addNewAsset.addEventListener("click", handleAssetModeButton);
  elements.transferCashButton.addEventListener("click", showTransferPanel);
  elements.closeTransferButton.addEventListener("click", hideTransferPanel);
  elements.timeFrame.addEventListener("change", render);
  elements.allocationMetric.addEventListener("change", render);
  elements.recordMonthFilter.addEventListener("change", render);
  elements.recordInstitutionFilter.addEventListener("change", render);
  elements.recordCategoryFilter.addEventListener("change", render);
  elements.recordTickerFilter.addEventListener("change", render);
  elements.search.addEventListener("input", render);
  await refreshHoldings();
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function populateInstitutions(): void {
  elements.institution.innerHTML = INSTITUTIONS.map((institution) => {
    return `<option value="${escapeHtml(institution)}">${escapeHtml(institution)}</option>`;
  }).join("");
}

function setActiveTab(tab: "dashboard" | "data"): void {
  const dashboardActive = tab === "dashboard";
  elements.dashboardPane.classList.toggle("hidden", !dashboardActive);
  elements.dataPane.classList.toggle("hidden", dashboardActive);
  elements.dashboardTabButton.classList.toggle("active", dashboardActive);
  elements.dataTabButton.classList.toggle("active", !dashboardActive);
  elements.dashboardTabButton.setAttribute("aria-selected", String(dashboardActive));
  elements.dataTabButton.setAttribute("aria-selected", String(!dashboardActive));
}

function populateCategories(selectedCategory?: Category): void {
  const institution = elements.institution.value as Institution;
  const categories = INSTITUTION_CATEGORIES[institution] || [];
  elements.category.innerHTML = categories.map((category) => {
    return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
  }).join("");
  elements.category.value =
    selectedCategory && categories.includes(selectedCategory) ? selectedCategory : categories[0] || "";
  updateCostBasisVisibility(elements.category.value as Category);
}

async function refreshHoldings(): Promise<void> {
  const [holdingsResponse, recordsResponse] = await Promise.all([
    fetchJson<{ holdings: Holding[] }>("/api/holdings"),
    fetchJson<{ records: ActivityRecord[] }>("/api/records"),
  ]);
  state.holdings = holdingsResponse.holdings;
  state.records = recordsResponse.records;
  populateAssetSelect();
  populateTransferAccounts();
  populateRecordFilters();
  resetForm();
  render();
}

async function saveHolding(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const payload: HoldingPayload = {
    month: elements.month.value,
    institution: elements.institution.value as Institution,
    asset: selectedAssetKey(),
    category: elements.category.value as Category,
    ticker: elements.ticker.value.trim(),
    currentValue: Number(elements.currentValue.value || 0),
    currentValueIsUnrealizedGain: elements.currentValueIsUnrealizedGain.checked,
    sold: elements.sold.checked,
    costBasis: Number(elements.costBasis.value || 0),
    notes: elements.notes.value.trim(),
  };

  const cashMovementNote = generatedManualSchwabCashMovementNote(payload);
  if (cashMovementNote) {
    const existingCash = movementBaseHolding();
    payload.notes = appendNotes(existingCash?.notes || "", cashMovementNote);
  }

  if (payload.sold) {
    const saved = await saveConvertedAsset(payload);
    if (saved) {
      resetForm();
      await refreshHoldings();
    }
    return;
  }

  const existingId = elements.editingId.value || existingMonthlyHoldingId(payload);
  const saved = await savePayload(payload, existingId);
  const manualCashDelta = manualCashMovementDelta(payload);
  if (manualCashDelta) {
    await saveRecord(recordFromHolding(saved, manualCashDelta > 0 ? "Cash deposit" : "Cash withdrawal", Math.abs(manualCashDelta), cashMovementNote, manualCashDelta));
  } else {
    await saveRecord(recordFromHolding(saved, existingId ? "Holding updated" : "Holding entered", saved.currentValue, saved.notes));
  }
  upsertLocalHolding(saved);
  if (!existingId && shouldDebitSchwabCashForPurchase(payload)) {
    await adjustCashHolding(
      schwabCashAccount(),
      payload.month,
      -payload.costBasis,
      generatedPurchaseNotes(payload),
      "Purchase cash debit",
      payload.ticker,
    );
    await refreshHoldings();
    return;
  }
  resetForm();
  render();
}

async function savePayload(payload: HoldingPayload, id = ""): Promise<Holding> {
  return id
    ? fetchJson<Holding>(`/api/holdings/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      })
    : fetchJson<Holding>("/api/holdings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
}

async function saveConvertedAsset(payload: HoldingPayload): Promise<boolean> {
  if (!isAutoCashConversion(payload)) {
    alert("Cash generation is supported for Charles Schwab ETFs, Mutual Funds, CDs, and Equities marked Matured/Sold only.");
    return false;
  }

  const proceeds = payload.currentValue;
  const convertedPayload: HoldingPayload = {
    ...payload,
    currentValue: 0,
    currentValueIsUnrealizedGain: false,
    costBasis: 0,
    sold: true,
  };
  const saved = await savePayload(convertedPayload, elements.editingId.value || existingMonthlyHoldingId(convertedPayload));
  await saveRecord(recordFromHolding(saved, payload.category === "CD" ? "Asset matured" : "Asset sold", proceeds, generatedCashNotes(payload)));
  await adjustCashHolding(schwabCashAccount(), payload.month, proceeds, generatedCashNotes(payload), "Sale cash credit", payload.ticker);
  return true;
}

function isAutoCashConversion(payload: HoldingPayload): boolean {
  if (payload.institution !== "Charles Schwab") {
    return false;
  }
  return ["ETF", "Mutual Fund", "CD", "Equities"].includes(payload.category);
}

function generatedCashNotes(payload: HoldingPayload): string {
  const action = payload.category === "CD" ? "matured" : "sold";
  const source = payload.ticker || payload.category;
  const note = `Generated from ${action} ${source}: added proceeds ${preciseCurrency.format(payload.currentValue)}.`;
  return payload.notes ? `${note} ${payload.notes}` : note;
}

function generatedPurchaseNotes(payload: HoldingPayload): string {
  const source = payload.ticker || payload.category;
  const note = `Generated from purchase of ${source}: subtracted cost basis ${preciseCurrency.format(payload.costBasis)}.`;
  return payload.notes ? `${note} ${payload.notes}` : note;
}

async function adjustCashHolding(
  account: CashAccount,
  month: string,
  delta: number,
  notes: string,
  action: string,
  recordTicker = account.ticker,
): Promise<void> {
  if (!delta) return;

  const cashAsset = generateAssetKey(account.institution, account.category, account.ticker, 0);
  const cashHoldings = state.holdings.filter((holding) => {
    return holding.month === month && canonicalAssetKey(holding) === cashAsset;
  });
  const existingCash = cashHoldings[0];
  const latestCash = latestCashHolding(account);
  const currentCash = cashHoldings.length ? sum(cashHoldings, "currentValue") : latestCash?.currentValue || 0;
  const nextCash = currentCash + delta;

  const cashPayload: HoldingPayload = {
    month,
    institution: account.institution,
    asset: cashAsset,
    category: account.category,
    ticker: account.ticker,
    currentValue: nextCash,
    currentValueIsUnrealizedGain: false,
    sold: false,
    costBasis: 0,
    notes: appendNotes(existingCash?.notes || "", notes),
  };
  const saved = await savePayload(cashPayload, existingCash?.id || "");
  await saveRecord({ ...recordFromHolding(saved, action, Math.abs(delta), notes, delta), ticker: recordTicker });
}

function latestCashHolding(account: CashAccount): Holding | undefined {
  const cashAsset = generateAssetKey(account.institution, account.category, account.ticker, 0);
  return [...state.holdings].sort(sortByMonthDesc).find((holding) => canonicalAssetKey(holding) === cashAsset);
}

function shouldDebitSchwabCashForPurchase(payload: HoldingPayload): boolean {
  return payload.institution === "Charles Schwab" && payload.category !== "Cash" && payload.costBasis > 0;
}

async function saveRecord(payload: ActivityRecordPayload): Promise<ActivityRecord> {
  const saved = await fetchJson<ActivityRecord>("/api/records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.records.unshift(saved);
  return saved;
}

function recordFromHolding(
  holding: Holding,
  action: string,
  amount: number,
  notes: string,
  cashDelta = 0,
): ActivityRecordPayload {
  return {
    month: holding.month,
    action,
    institution: holding.institution,
    category: holding.category,
    ticker: holding.ticker,
    amount,
    cashDelta,
    notes,
    holdingId: holding.id,
  };
}

function schwabCashAccount(): CashAccount {
  return CASH_TRANSFER_ACCOUNTS[0];
}

function cashAccountValue(account: CashAccount): string {
  return [account.institution, account.category, account.ticker].join("|");
}

function parseCashAccount(value: string): CashAccount | undefined {
  return CASH_TRANSFER_ACCOUNTS.find((account) => cashAccountValue(account) === value);
}

function transferAccountLabel(account: CashAccount): string {
  return `${account.label} (${preciseCurrency.format(cashAccountBalance(account))})`;
}

function cashAccountBalance(account: CashAccount): number {
  return latestCashHolding(account)?.currentValue || 0;
}

function generatedManualSchwabCashMovementNote(payload: HoldingPayload): string {
  if (payload.institution !== "Charles Schwab" || payload.category !== "Cash") {
    return "";
  }
  if (elements.accountMovementPanel.classList.contains("hidden")) {
    return "";
  }

  const movement = elements.movementType.value as MovementType;
  if (!["add", "withdraw"].includes(movement)) {
    return "";
  }

  const amount = Number(elements.movementAmount.value || 0);
  if (!amount) {
    return "";
  }

  const action = movement === "add" ? "Deposit into Cash" : "Withdrawal from Cash";
  return payload.notes ? `${action}: ${preciseCurrency.format(amount)}. ${payload.notes}` : `${action}: ${preciseCurrency.format(amount)}.`;
}

function manualCashMovementDelta(payload: HoldingPayload): number {
  if (payload.institution !== "Charles Schwab" || payload.category !== "Cash") {
    return 0;
  }
  if (elements.accountMovementPanel.classList.contains("hidden")) {
    return 0;
  }
  const movement = elements.movementType.value as MovementType;
  const amount = Number(elements.movementAmount.value || 0);
  if (movement === "add") return amount;
  if (movement === "withdraw") return -amount;
  return 0;
}

function appendNotes(existingNotes: string, nextNote: string): string {
  if (!existingNotes) return nextNote;
  if (!nextNote) return existingNotes;
  return `${existingNotes} ${nextNote}`;
}

function upsertLocalHolding(saved: Holding): void {
  const existingIndex = state.holdings.findIndex((holding) => holding.id === saved.id);
  if (existingIndex >= 0) {
    state.holdings[existingIndex] = saved;
  } else {
    state.holdings.push(saved);
  }
}

function resetForm(): void {
  elements.form.reset();
  elements.editingId.value = "";
  elements.month.value = currentMonth();
  populateAssetSelect();
  setFormMode(state.holdings.length ? "existing" : "new");
  if (state.formMode === "existing") {
    prefillSelectedAsset();
  } else {
    elements.institution.value = DEFAULT_INSTITUTION;
    populateCategories();
    hideAccountMovement();
    updateCurrentValueBounds();
  }
}

function startNewAsset(): void {
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

function setFormMode(mode: FormMode): void {
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

function handleAssetModeButton(): void {
  if (state.formMode === "new") {
    resetForm();
    return;
  }
  startNewAsset();
}

function populateAssetSelect(): void {
  const assets = latestAssets();
  elements.assetSelect.innerHTML = assets.length
    ? assets
        .map((holding) => {
          return `<option value="${holding.id}">${escapeHtml(assetOptionLabel(holding))}</option>`;
        })
        .join("")
    : `<option value="">No assets entered yet</option>`;
}

function populateTransferAccounts(): void {
  const options = CASH_TRANSFER_ACCOUNTS.map((account) => {
    return `<option value="${escapeHtml(cashAccountValue(account))}">${escapeHtml(transferAccountLabel(account))}</option>`;
  }).join("");
  const currentFrom = elements.transferFrom.value;
  const currentTo = elements.transferTo.value;
  elements.transferFrom.innerHTML = options;
  elements.transferTo.innerHTML = options;
  elements.transferFrom.value = CASH_TRANSFER_ACCOUNTS.some((account) => cashAccountValue(account) === currentFrom)
    ? currentFrom
    : cashAccountValue(CASH_TRANSFER_ACCOUNTS[0]);
  elements.transferTo.value = CASH_TRANSFER_ACCOUNTS.some((account) => cashAccountValue(account) === currentTo)
    ? currentTo
    : cashAccountValue(CASH_TRANSFER_ACCOUNTS[1] || CASH_TRANSFER_ACCOUNTS[0]);
}

function showTransferPanel(): void {
  populateTransferAccounts();
  elements.transferPanel.classList.remove("hidden");
  elements.transferMonth.value = elements.month.value || currentMonth();
  elements.transferAmount.focus();
}

function hideTransferPanel(): void {
  elements.transferPanel.classList.add("hidden");
  elements.transferForm.reset();
  elements.transferMonth.value = currentMonth();
  populateTransferAccounts();
}

async function saveCashTransfer(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const from = parseCashAccount(elements.transferFrom.value);
  const to = parseCashAccount(elements.transferTo.value);
  const amount = Number(elements.transferAmount.value || 0);
  const month = elements.transferMonth.value;
  const notes = elements.transferNotes.value.trim();

  if (!from || !to || cashAccountValue(from) === cashAccountValue(to)) {
    alert("Choose two different cash accounts.");
    return;
  }
  if (amount <= 0) {
    alert("Transfer amount must be greater than 0.");
    return;
  }

  const transferNote = notes
    ? `Cash transfer from ${from.label} to ${to.label}: ${preciseCurrency.format(amount)}. ${notes}`
    : `Cash transfer from ${from.label} to ${to.label}: ${preciseCurrency.format(amount)}.`;
  await adjustCashHolding(from, month, -amount, transferNote, "Cash transfer out");
  await refreshHoldings();
  await adjustCashHolding(to, month, amount, transferNote, "Cash transfer in");

  elements.transferForm.reset();
  elements.transferMonth.value = currentMonth();
  hideTransferPanel();
  await refreshHoldings();
}

function prefillSelectedAsset(): void {
  const holding = state.holdings.find((item) => item.id === elements.assetSelect.value);
  if (!holding) return;

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

function selectedAssetKey(): string {
  if (state.formMode === "existing") {
    const holding = state.holdings.find((item) => item.id === elements.assetSelect.value);
    return holding ? canonicalAssetKey(holding) : "";
  }
  return generateAssetKey(
    elements.institution.value as Institution,
    elements.category.value as Category,
    elements.ticker.value,
    Number(elements.costBasis.value || 0),
  );
}

function existingMonthlyHoldingId(payload: HoldingPayload): string {
  return (
    state.holdings.find((holding) => holding.month === payload.month && canonicalAssetKey(holding) === payload.asset)?.id || ""
  );
}

function latestAssets(): Holding[] {
  const latestByAsset = new Map<string, Holding>();
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

function assetOptionLabel(holding: Holding): string {
  const product = holding.ticker ? ` - ${holding.ticker}` : "";
  const basis = isAccountStyleCategory(holding.category) ? "" : ` - ${preciseCurrency.format(holding.costBasis || 0)}`;
  return `${holding.institution} - ${holding.category}${product}${basis}`;
}

function render(): void {
  const dashboardHoldings = getDashboardHoldings();
  const retirementHoldings = dashboardHoldings.filter((holding) => isRetirementCategory(holding.category));
  renderSummary(dashboardHoldings);
  renderAllAssets(dashboardHoldings);
  renderRetirement(retirementHoldings);
  renderTable(getActivityRecords());
}

function getDashboardHoldings(): Holding[] {
  const frame = elements.timeFrame.value as TimeFrame;
  let holdings = [...state.holdings].sort(sortByMonthDesc);

  if (frame === "latest") {
    const latest = holdings[0]?.month;
    holdings = latest ? holdings.filter((holding) => holding.month === latest) : [];
  } else if (frame !== "all") {
    const months = uniqueMonths(holdings).slice(0, Number(frame));
    holdings = holdings.filter((holding) => months.includes(holding.month));
  }

  return holdings;
}

function getActivityRecords(): ActivityRecord[] {
  const query = elements.search.value.trim().toLowerCase();
  let records = [...state.records].sort(sortRecordByEntryDateDesc);
  const month = elements.recordMonthFilter.value;
  const institution = elements.recordInstitutionFilter.value;
  const category = elements.recordCategoryFilter.value;
  const ticker = elements.recordTickerFilter.value;

  if (month) records = records.filter((record) => record.month === month);
  if (institution) records = records.filter((record) => record.institution === institution);
  if (category) records = records.filter((record) => record.category === category);
  if (ticker) records = records.filter((record) => (record.ticker || "") === ticker);

  if (query) {
    records = records.filter((record) => {
      return [
        record.action,
        record.institution,
        record.category,
        record.ticker,
        record.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  return records;
}

function populateRecordFilters(): void {
  setFilterOptions(elements.recordMonthFilter, uniqueRecordMonths(state.records), "All Months");
  setFilterOptions(elements.recordInstitutionFilter, uniqueRecordValues(state.records, "institution"), "All Institutions");
  setFilterOptions(elements.recordCategoryFilter, uniqueRecordValues(state.records, "category"), "All Categories");
  setFilterOptions(elements.recordTickerFilter, uniqueRecordTickers(state.records), "All Tickers/Products");
}

function setFilterOptions(select: HTMLSelectElement, values: string[], allLabel: string): void {
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "-")}</option>`),
  ].join("");
  select.value = values.includes(currentValue) ? currentValue : "";
}

function uniqueValues(holdings: Holding[], key: "institution" | "category"): string[] {
  return [...new Set(holdings.map((holding) => holding[key]))].sort((a, b) => a.localeCompare(b));
}

function uniqueTickers(holdings: Holding[]): string[] {
  return [...new Set(holdings.map((holding) => holding.ticker || ""))].sort((a, b) => a.localeCompare(b));
}

function uniqueRecordMonths(records: ActivityRecord[]): string[] {
  return [...new Set(records.map((record) => record.month))].sort().reverse();
}

function uniqueRecordValues(records: ActivityRecord[], key: "institution" | "category"): string[] {
  return [...new Set(records.map((record) => record[key]))].sort((a, b) => a.localeCompare(b));
}

function uniqueRecordTickers(records: ActivityRecord[]): string[] {
  return [...new Set(records.map((record) => record.ticker || ""))].sort((a, b) => a.localeCompare(b));
}

function renderSummary(holdings: Holding[]): void {
  const allocationHoldings = holdings.filter((holding) => isNonRetirementSummaryCategory(holding.category));
  const metric = elements.allocationMetric.value as AllocationMetric;
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

function renderAllAssets(holdings: Holding[]): void {
  const metric = elements.allocationMetric.value as AllocationMetric;
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

function renderRetirement(holdings: Holding[]): void {
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

function renderTable(records: ActivityRecord[]): void {
  if (!records.length) {
    elements.table.innerHTML = `
      <tr>
        <td colspan="9">${elements.emptyState.innerHTML}</td>
      </tr>
    `;
    return;
  }

  elements.table.innerHTML = records
    .map((record) => {
      return `
        <tr>
          <td>${escapeHtml(record.month)}</td>
          <td>${escapeHtml(formatEntryTimestamp(record.createdAt))}</td>
          <td>${escapeHtml(record.action)}</td>
          <td>${escapeHtml(record.institution)}</td>
          <td>${escapeHtml(record.category)}</td>
          <td>${escapeHtml(record.ticker || "-")}</td>
          <td class="number">${record.amount ? preciseCurrency.format(record.amount) : "-"}</td>
          <td class="number">${record.cashDelta ? preciseCurrency.format(record.cashDelta) : "-"}</td>
          <td>${escapeHtml(record.notes || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

async function handleTableAction(event: MouseEvent): Promise<void> {
  const target = event.currentTarget as HTMLButtonElement;
  const action = target.dataset.action;
  const id = target.dataset.id;
  const holding = state.holdings.find((item) => item.id === id);
  if (!holding || !id) return;

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
    await fetchJson<{ ok: boolean }>(`/api/holdings/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.holdings = state.holdings.filter((item) => item.id !== id);
    render();
  }
}

function groupHoldings(holdings: Holding[], key: "category", metric: AllocationMetric): Array<{ name: string; value: number }> {
  const map = new Map<string, { name: string; value: number }>();
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

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function currentMonth(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function uniqueMonths(holdings: Holding[]): string[] {
  return [...new Set(holdings.map((holding) => holding.month))].sort().reverse();
}

function sum(holdings: Holding[], key: "currentValue" | "costBasis"): number {
  return holdings.reduce((total, holding) => total + Number(holding[key] || 0), 0);
}

function renderMetricRow({
  holdings,
  totalValue,
  totalCost,
  totalGain,
  monthsTracked,
}: {
  holdings: Holding[];
  totalValue: HTMLElement;
  totalCost: HTMLElement;
  totalGain: HTMLElement;
  monthsTracked: HTMLElement;
}): void {
  const cost = sum(holdings, "costBasis");
  const gain = sum(holdings, "currentValue") - cost;

  totalValue.textContent = currency.format(sum(holdings, "currentValue"));
  totalCost.textContent = currency.format(cost);
  totalGain.textContent = currency.format(gain);
  totalGain.style.color = gain < 0 ? "var(--danger)" : "var(--primary)";
  monthsTracked.textContent = String(uniqueMonths(holdings).length);
}

function sortByMonthDesc(a: Holding, b: Holding): number {
  return b.month.localeCompare(a.month) || a.institution.localeCompare(b.institution);
}

function sortByEntryDateDesc(a: Holding, b: Holding): number {
  const aEntryDate = a.createdAt || a.updatedAt || "";
  const bEntryDate = b.createdAt || b.updatedAt || "";
  return bEntryDate.localeCompare(aEntryDate) || sortByMonthDesc(a, b);
}

function sortRecordByEntryDateDesc(a: ActivityRecord, b: ActivityRecord): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function formatEntryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function barColor(index: number): string {
  const colors = ["#5b8cff", "#f0b35b", "#7aa2ff", "#d87fd3", "#55c7d9", "#ff7d8a"];
  return colors[index % colors.length];
}

function generateAssetKey(
  institution: Institution,
  category: Category,
  ticker: string,
  costBasis: number,
): string {
  if (institution === "Charles Schwab" && category === "Cash") {
    ticker = "";
  }
  const parts = isAccountStyleCategory(category)
    ? [institution, category, ticker || "No ticker"]
    : [institution, category, ticker || "No ticker", costBasis.toFixed(2)];
  return parts.map(keyPart).join("_");
}

function schwabCashAssetKey(): string {
  return generateAssetKey("Charles Schwab", "Cash", "", 0);
}

function canonicalAssetKey(holding: Holding): string {
  return generateAssetKey(holding.institution, holding.category, holding.ticker, holding.costBasis || 0);
}

function isAccountStyleCategory(category: Category): boolean {
  return ACCOUNT_STYLE_CATEGORIES.includes(category);
}

function isNoCostBasisCategory(category: Category): boolean {
  return NO_COST_BASIS_CATEGORIES.includes(category);
}

function isRetirementCategory(category: Category): boolean {
  return RETIREMENT_CATEGORIES.includes(category);
}

function isNonRetirementSummaryCategory(category: Category): boolean {
  return NON_RETIREMENT_SUMMARY_CATEGORIES.includes(category);
}

function updateCostBasisVisibility(category: Category): void {
  elements.costBasis.closest("label")?.classList.remove("hidden");
}

function updateCurrentValueBounds(): void {
  if (elements.currentValueIsUnrealizedGain.checked) {
    elements.currentValue.removeAttribute("min");
    return;
  }
  elements.currentValue.min = "0";
}

function updateSoldState(): void {
  if (elements.sold.checked) {
    elements.currentValueIsUnrealizedGain.checked = false;
  }
  updateCurrentValueBounds();
}

function setupAccountMovement(holding: Holding): void {
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

function hideAccountMovement(): void {
  elements.accountMovementPanel.classList.add("hidden");
  elements.previousBalance.textContent = preciseCurrency.format(0);
  elements.movementType.value = "set";
  elements.movementAmount.value = "";
  elements.movementAmountLabel.classList.add("hidden");
  elements.currentValue.readOnly = false;
  elements.currentValue.placeholder = "";
  elements.notes.readOnly = state.formMode === "existing";
}

function updateMovementAmount(): void {
  if (elements.accountMovementPanel.classList.contains("hidden")) {
    return;
  }

  const movement = elements.movementType.value as MovementType;
  elements.movementAmountLabel.classList.toggle("hidden", movement === "set");
  elements.currentValue.readOnly = movement !== "set";

  if (movement === "set") {
    return;
  }

  const holding = movementBaseHolding();
  if (!holding) return;

  const amount = Number(elements.movementAmount.value || 0);
  const nextValue = movement === "add" ? holding.currentValue + amount : Math.max(0, holding.currentValue - amount);
  elements.currentValue.value = nextValue.toFixed(2);
}

function syncSetBalanceAmount(): void {
  if (elements.movementType.value === "set") {
    return;
  }
  updateMovementAmount();
}

function isMovementCategory(category: Category): boolean {
  return MOVEMENT_CATEGORIES.includes(category);
}

function movementBaseHolding(): Holding | undefined {
  const id = state.formMode === "edit" ? elements.editingId.value : elements.assetSelect.value;
  return state.holdings.find((item) => item.id === id);
}


function keyPart(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/_+/g, "-") || "None";
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
