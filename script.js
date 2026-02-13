const checksList = document.getElementById("checks-list");
const accountsList = document.getElementById("accounts-list");
const itemsList = document.getElementById("items-list");
const accountBalanceList = document.getElementById("account-balance-list");
const summaryAccountStrip = document.getElementById("summary-account-strip");

const addCheckBtn = document.getElementById("add-check-btn");
const addAccountBtn = document.getElementById("add-account-btn");
const addItemBtn = document.getElementById("add-item-btn");
const themeToggleBtn = document.getElementById("theme-toggle");
const resetBtn = document.getElementById("reset-btn");

const tabButtons = [...document.querySelectorAll(".tab-btn")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];
const STORAGE_KEY = "budget_calculator_state_v1";

const BUDGET_FIELDS = [
  { amountId: "bills", accountSelectId: "bills-account" },
  { amountId: "spending", accountSelectId: "spending-account" },
  { amountId: "debt", accountSelectId: "debt-account" },
  { amountId: "savings", accountSelectId: "savings-account" },
];

const resultFields = {
  gross: document.getElementById("gross-total"),
  taxes: document.getElementById("tax-total"),
  k401: document.getElementById("k401-total"),
  benefits: document.getElementById("benefits-total"),
  net: document.getElementById("net-total"),
  planned: document.getElementById("planned-total"),
  remainder: document.getElementById("remainder-total"),
  allocationFill: document.getElementById("allocation-fill"),
  allocationMeta: document.getElementById("allocation-meta"),
};

const TAX_CONSTANTS = {
  ficoRate: 0.0765,
  standardDeductionSingle: 15750,
  federalBrackets: [
    { cap: 12400, rate: 0.1 },
    { cap: 50400, rate: 0.12 },
    { cap: 105700, rate: 0.22 },
    { cap: 201775, rate: 0.24 },
    { cap: 256225, rate: 0.32 },
    { cap: 640600, rate: 0.35 },
    { cap: Infinity, rate: 0.37 },
  ],
  nmBrackets: [
    { cap: 5500, rate: 0.017 },
    { cap: 11000, rate: 0.032 },
    { cap: 16000, rate: 0.047 },
    { cap: 210000, rate: 0.049 },
    { cap: Infinity, rate: 0.059 },
  ],
};

let accountIdCounter = 1;

function money(value) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "$0.00";
}

function num(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function withFloor(value) {
  return Math.max(0, value);
}

function addBracketTax(amount, brackets) {
  let tax = 0;
  let previousCap = 0;

  for (const bracket of brackets) {
    if (amount <= previousCap) break;
    const taxableInBand = Math.min(amount, bracket.cap) - previousCap;
    tax += taxableInBand * bracket.rate;
    previousCap = bracket.cap;
  }

  return withFloor(tax);
}

function annualMultiplier(payFrequency) {
  return payFrequency === "weekly" ? 52 : 26;
}

function nextAccountId() {
  const id = `acc-${accountIdCounter}`;
  accountIdCounter += 1;
  return id;
}

function checkDataFromCard(card) {
  return {
    frequency: card.querySelector(".pay-frequency").value,
    hourlyPay: card.querySelector(".hourly-pay").value,
    regularHours: card.querySelector(".regular-hours").value,
    overtimeHours: card.querySelector(".overtime-hours").value,
    bonus: card.querySelector(".bonus").value,
    k401Percent: card.querySelector(".k401-percent").value,
    benefits: card.querySelector(".benefits").value,
    knownNet: card.querySelector(".known-net").value,
  };
}

function calcCheck(checkCard) {
  const knownNetRaw = checkCard.querySelector(".known-net").value.trim();
  const knownNetInput = num(knownNetRaw);
  const hasKnownNet = knownNetRaw !== "";

  if (hasKnownNet) {
    const knownNet = withFloor(knownNetInput);
    return {
      hasKnownNet: true,
      gross: knownNet,
      taxes: 0,
      k401: 0,
      benefits: 0,
      net: knownNet,
    };
  }

  const frequency = checkCard.querySelector(".pay-frequency").value;
  const hourlyPay = num(checkCard.querySelector(".hourly-pay").value);
  const regularHours = num(checkCard.querySelector(".regular-hours").value);
  const overtimeHours = num(checkCard.querySelector(".overtime-hours").value);
  const bonus = num(checkCard.querySelector(".bonus").value);
  const kPercent = num(checkCard.querySelector(".k401-percent").value) / 100;
  const benefits = num(checkCard.querySelector(".benefits").value);

  const gross = withFloor(hourlyPay * regularHours + hourlyPay * 1.5 * overtimeHours + bonus);
  const k401 = withFloor(gross * kPercent);

  const multiplier = annualMultiplier(frequency);
  const annualTaxable = withFloor((gross - k401) * multiplier);
  const annualFederalTaxable = withFloor(annualTaxable - TAX_CONSTANTS.standardDeductionSingle);
  const annualFederalTax = addBracketTax(annualFederalTaxable, TAX_CONSTANTS.federalBrackets);
  const annualNMTax = addBracketTax(annualTaxable, TAX_CONSTANTS.nmBrackets);

  const federal = annualFederalTax / multiplier;
  const nmTax = annualNMTax / multiplier;
  const fica = gross * TAX_CONSTANTS.ficoRate;
  const taxes = withFloor(federal + nmTax + fica);
  const net = gross - taxes - k401 - benefits;

  return {
    hasKnownNet: false,
    gross,
    taxes,
    k401,
    benefits: withFloor(benefits),
    net,
  };
}

function setTheme(theme, options = {}) {
  const { skipSave = false } = options;
  const normalized = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = normalized;
  themeToggleBtn.textContent = normalized === "dark" ? "Light Mode" : "Dark Mode";
  if (!skipSave) saveState();
}

function setActiveTab(tab, options = {}) {
  const { skipSave = false } = options;
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tab !== tab;
  });
  document.body.dataset.activeTab = tab;

  if (!skipSave) saveState();
}

function accountDisplayNameFromRow(row) {
  const type = row.querySelector(".account-type")?.value || "Account";
  const custom = row.querySelector(".account-custom")?.value.trim() || "";
  return type === "Custom" ? custom || "Custom Account" : type;
}

function refreshBudgetAccountSelectors() {
  const accounts = [...accountsList.querySelectorAll(".account-row")].map((row) => ({
    id: row.dataset.accountId,
    name: accountDisplayNameFromRow(row),
  }));

  BUDGET_FIELDS.forEach(({ accountSelectId }) => {
    const select = document.getElementById(accountSelectId);
    if (!select) return;

    const previous = select.value;
    select.innerHTML = "";

    const unassigned = document.createElement("option");
    unassigned.value = "";
    unassigned.textContent = "Unassigned";
    select.appendChild(unassigned);

    accounts.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = account.name;
      select.appendChild(option);
    });

    const hasPrevious = accounts.some((account) => account.id === previous);
    select.value = hasPrevious ? previous : "";
  });
}

function wireKnownNetToggle(checkNode) {
  const knownNetInput = checkNode.querySelector(".known-net");
  const estimateFields = checkNode.querySelector(".estimate-fields");
  if (!knownNetInput || !estimateFields) return;

  const sync = () => {
    const hasKnownNet = knownNetInput.value.trim() !== "";
    estimateFields.hidden = hasKnownNet;
    estimateFields.classList.toggle("is-hidden", hasKnownNet);
  };

  sync();
  knownNetInput.addEventListener("input", sync);
}

function wireDuplicate(checkNode) {
  checkNode.querySelector(".duplicate-btn")?.addEventListener("click", () => {
    addCheck(checkDataFromCard(checkNode));
  });
}

function wireAccountType(accountRow) {
  const typeSelect = accountRow.querySelector(".account-type");
  const customInput = accountRow.querySelector(".account-custom");
  const customWrap = accountRow.querySelector(".account-custom-wrap");
  if (!typeSelect || !customInput || !customWrap) return;

  const sync = () => {
    const isCustom = typeSelect.value === "Custom";
    customInput.disabled = !isCustom;
    customWrap.hidden = !isCustom;
    if (!isCustom) customInput.value = "";
    refreshBudgetAccountSelectors();
  };

  sync();
  typeSelect.addEventListener("change", sync);
  customInput.addEventListener("input", refreshBudgetAccountSelectors);
}

function addCheck(data = {}, options = {}) {
  const { skipCalc = false } = options;
  const template = document.getElementById("check-template");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector(".pay-frequency").value = data.frequency || "weekly";
  node.querySelector(".hourly-pay").value = data.hourlyPay ?? "";
  node.querySelector(".regular-hours").value = data.regularHours ?? "";
  node.querySelector(".overtime-hours").value = data.overtimeHours ?? "";
  node.querySelector(".bonus").value = data.bonus ?? "";
  node.querySelector(".k401-percent").value = data.k401Percent ?? "";
  node.querySelector(".benefits").value = data.benefits ?? "";
  node.querySelector(".known-net").value = data.knownNet ?? "";

  checksList.appendChild(node);
  wireKnownNetToggle(node);
  wireDuplicate(node);
  wireRemove(node, checksList, ".check-card");
  refreshCheckIndexes();
  if (!skipCalc) calculateAll();
}

function addAccount(data = {}, options = {}) {
  const { skipCalc = false } = options;
  const template = document.getElementById("account-template");
  const node = template.content.firstElementChild.cloneNode(true);

  const id = data.id || nextAccountId();
  if (data.id) {
    const parsed = Number(String(data.id).replace("acc-", ""));
    if (Number.isFinite(parsed) && parsed >= accountIdCounter) {
      accountIdCounter = parsed + 1;
    }
  }
  node.dataset.accountId = id;

  node.querySelector(".account-type").value = data.type || "Checking";
  node.querySelector(".account-custom").value = data.customName || "";
  node.querySelector(".account-amount").value = data.amount ?? "";

  wireAccountType(node);
  accountsList.appendChild(node);
  wireRemove(node, accountsList, ".account-row");
  refreshBudgetAccountSelectors();
  if (!skipCalc) calculateAll();
}

function addItem(data = {}, options = {}) {
  const { skipCalc = false } = options;
  const template = document.getElementById("item-template");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector(".item-type").value = data.type || "expense";
  node.querySelector(".item-name").value = data.name || "";
  node.querySelector(".item-amount").value = data.amount ?? "";

  itemsList.appendChild(node);
  wireRemove(node, itemsList, ".item-row");
  if (!skipCalc) calculateAll();
}

function wireRemove(node, list, selector) {
  node.querySelector(".remove-btn")?.addEventListener("click", () => {
    const rows = list.querySelectorAll(selector);
    if (rows.length > 1 || list !== checksList) {
      node.remove();
      if (list === checksList) refreshCheckIndexes();
      if (list === accountsList) refreshBudgetAccountSelectors();
      calculateAll();
    }
  });
}

function refreshCheckIndexes() {
  checksList.querySelectorAll(".check-card").forEach((card, idx) => {
    card.querySelector(".check-index").textContent = String(idx + 1);
  });
}

function adjustmentTotal() {
  return [...itemsList.querySelectorAll(".item-row")].reduce((sum, row) => {
    const type = row.querySelector(".item-type").value;
    const amount = num(row.querySelector(".item-amount").value);
    return sum + (type === "income" ? amount : -amount);
  }, 0);
}

function accountAllocations() {
  return [...accountsList.querySelectorAll(".account-row")].map((row) => ({
    id: row.dataset.accountId,
    name: accountDisplayNameFromRow(row),
    amount: withFloor(num(row.querySelector(".account-amount").value)),
  }));
}

function budgetUsageByAccount() {
  const usage = new Map();
  BUDGET_FIELDS.forEach(({ amountId, accountSelectId }) => {
    const amount = withFloor(num(document.getElementById(amountId).value));
    const accountId = document.getElementById(accountSelectId).value;
    if (!accountId || amount <= 0) return;
    usage.set(accountId, (usage.get(accountId) || 0) + amount);
  });
  return usage;
}

function renderAccountBalances(accounts, usageMap) {
  accountBalanceList.innerHTML = "";

  if (!accounts.length) {
    const empty = document.createElement("p");
    empty.className = "small-note";
    empty.textContent = "No accounts yet. Add one in the Accounts tab.";
    accountBalanceList.appendChild(empty);
    return;
  }

  accounts.forEach((account) => {
    const used = usageMap.get(account.id) || 0;
    const remaining = account.amount - used;

    const row = document.createElement("div");
    row.className = "row-card account-balance-row";

    row.innerHTML = `
      <div>
        <span class="label">${account.name}</span>
        <strong>${money(remaining)}</strong>
      </div>
      <div class="account-balance-meta">
        <small>Allocated: ${money(account.amount)}</small>
        <small>Used: ${money(used)}</small>
      </div>
    `;

    const totalEl = row.querySelector("strong");
    if (remaining < 0) totalEl.style.color = "#ef6f6f";

    accountBalanceList.appendChild(row);
  });
}

function renderBudgetMiniAccounts(accounts, usageMap) {
  summaryAccountStrip.innerHTML = "";
  const visibleAccounts = accounts.filter((account) => {
    const used = usageMap.get(account.id) || 0;
    const remaining = account.amount - used;
    return account.amount > 0 || remaining < 0;
  });

  if (!visibleAccounts.length) {
    const stickyEmpty = document.createElement("p");
    stickyEmpty.className = "small-note";
    stickyEmpty.textContent = "No funded or overdrawn accounts yet.";
    summaryAccountStrip.appendChild(stickyEmpty);
    return;
  }

  visibleAccounts.forEach((account) => {
    const used = usageMap.get(account.id) || 0;
    const remaining = account.amount - used;

    const chip = document.createElement("div");
    chip.className = "mini-account-chip";
    chip.innerHTML = `
      <span class="label">${account.name}</span>
      <strong>${money(remaining)}</strong>
    `;

    const value = chip.querySelector("strong");
    if (remaining < 0) value.style.color = "#ef6f6f";

    chip.className = "summary-account-chip";
    summaryAccountStrip.appendChild(chip);
  });
}

function getState() {
  const checks = [...checksList.querySelectorAll(".check-card")].map((card) => ({
    frequency: card.querySelector(".pay-frequency").value,
    hourlyPay: card.querySelector(".hourly-pay").value,
    regularHours: card.querySelector(".regular-hours").value,
    overtimeHours: card.querySelector(".overtime-hours").value,
    bonus: card.querySelector(".bonus").value,
    k401Percent: card.querySelector(".k401-percent").value,
    benefits: card.querySelector(".benefits").value,
    knownNet: card.querySelector(".known-net").value,
  }));

  const accounts = [...accountsList.querySelectorAll(".account-row")].map((row) => ({
    id: row.dataset.accountId,
    type: row.querySelector(".account-type").value,
    customName: row.querySelector(".account-custom").value,
    amount: row.querySelector(".account-amount").value,
  }));

  const items = [...itemsList.querySelectorAll(".item-row")].map((row) => ({
    type: row.querySelector(".item-type").value,
    name: row.querySelector(".item-name").value,
    amount: row.querySelector(".item-amount").value,
  }));

  const budget = {};
  BUDGET_FIELDS.forEach(({ amountId, accountSelectId }) => {
    budget[amountId] = document.getElementById(amountId).value;
    budget[accountSelectId] = document.getElementById(accountSelectId).value;
  });

  const activeTab = tabButtons.find((button) => button.classList.contains("active"))?.dataset.tab;
  return {
    checks,
    accounts,
    items,
    budget,
    activeTab: activeTab || "checks",
    theme: document.body.dataset.theme || "dark",
    accountIdCounter,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
}

function restoreState() {
  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) return false;

  let state;
  try {
    state = JSON.parse(rawState);
  } catch {
    return false;
  }

  checksList.innerHTML = "";
  accountsList.innerHTML = "";
  itemsList.innerHTML = "";

  accountIdCounter = Number.isFinite(state.accountIdCounter) ? state.accountIdCounter : 1;

  state.checks?.forEach((check) => addCheck(check, { skipCalc: true }));
  state.accounts?.forEach((account) => addAccount(account, { skipCalc: true }));
  state.items?.forEach((item) => addItem(item, { skipCalc: true }));

  if (!checksList.children.length) addCheck({}, { skipCalc: true });
  if (!accountsList.children.length) {
    addAccount({ type: "Checking" }, { skipCalc: true });
    addAccount({ type: "Spending" }, { skipCalc: true });
    addAccount({ type: "High-Yield Savings" }, { skipCalc: true });
  }
  if (!itemsList.children.length) addItem({ type: "expense" }, { skipCalc: true });

  refreshBudgetAccountSelectors();

  if (state.budget) {
    BUDGET_FIELDS.forEach(({ amountId, accountSelectId }) => {
      document.getElementById(amountId).value = state.budget[amountId] ?? "";
      const select = document.getElementById(accountSelectId);
      if (state.budget[accountSelectId]) select.value = state.budget[accountSelectId];
    });
  }

  setTheme(state.theme || "dark", { skipSave: true });
  setActiveTab(state.activeTab || "checks", { skipSave: true });
  calculateAll();
  return true;
}

function resetAllData() {
  const accepted = window.confirm("Clear all checks, accounts, budget, and income/expense data?");
  if (!accepted) return;

  const theme = document.body.dataset.theme || "dark";
  checksList.innerHTML = "";
  accountsList.innerHTML = "";
  itemsList.innerHTML = "";
  accountIdCounter = 1;

  BUDGET_FIELDS.forEach(({ amountId, accountSelectId }) => {
    document.getElementById(amountId).value = "";
    document.getElementById(accountSelectId).value = "";
  });

  addCheck();
  addAccount({ type: "Checking" });
  addAccount({ type: "Spending" });
  addAccount({ type: "High-Yield Savings" });
  addItem({ type: "expense" });

  refreshBudgetAccountSelectors();
  setActiveTab("checks", { skipSave: true });
  setTheme(theme, { skipSave: true });
  calculateAll();
}

function calculateAll() {
  const checks = [...checksList.querySelectorAll(".check-card")];

  const totals = checks.reduce(
    (acc, card) => {
      const check = calcCheck(card);
      acc.gross += check.gross;
      acc.taxes += check.taxes;
      acc.k401 += check.k401;
      acc.benefits += check.benefits;
      acc.net += check.net;
      return acc;
    },
    { gross: 0, taxes: 0, k401: 0, benefits: 0, net: 0 },
  );

  const finalNet = totals.net + adjustmentTotal();
  const accounts = accountAllocations();
  const usageMap = budgetUsageByAccount();
  const planned = accounts.reduce((sum, account) => sum + account.amount, 0);
  const remainder = finalNet - planned;

  renderAccountBalances(accounts, usageMap);
  renderBudgetMiniAccounts(accounts, usageMap);

  resultFields.gross.textContent = money(totals.gross);
  resultFields.taxes.textContent = money(totals.taxes);
  resultFields.k401.textContent = money(totals.k401);
  resultFields.benefits.textContent = money(totals.benefits);
  resultFields.net.textContent = money(finalNet);
  resultFields.planned.textContent = money(planned);
  resultFields.remainder.textContent = money(remainder);
  resultFields.remainder.style.color = remainder < 0 ? "#ef6f6f" : "#1bc6cf";

  const safeNet = Math.max(finalNet, 0);
  const ratio = safeNet > 0 ? planned / safeNet : 0;
  const boundedPercent = Math.min(Math.max(ratio * 100, 0), 100);
  const overBy = planned - safeNet;
  const overBudget = overBy > 0;

  resultFields.allocationFill.style.width = `${boundedPercent}%`;
  resultFields.allocationFill.style.background = overBudget
    ? "linear-gradient(90deg, #b93a3a 0%, #ef6f6f 100%)"
    : "linear-gradient(90deg, #1bc6cf 0%, #9b7bff 100%)";

  const allocationText = safeNet > 0 ? `${Math.round(ratio * 100)}% allocated` : "0% allocated";
  resultFields.allocationMeta.textContent = overBudget
    ? `${allocationText} • Over by ${money(overBy)}`
    : `${allocationText} • ${money(Math.max(remainder, 0))} available`;

  saveState();
}

addCheckBtn.addEventListener("click", () => addCheck());
addAccountBtn.addEventListener("click", () => addAccount());
addItemBtn.addEventListener("click", () => addItem({ type: "expense" }));
resetBtn.addEventListener("click", resetAllData);

document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement) {
    calculateAll();
  }
});

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement) {
    calculateAll();
  }
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
});

themeToggleBtn.addEventListener("click", () => {
  const next = document.body.dataset.theme === "light" ? "dark" : "light";
  setTheme(next);
});

if (!restoreState()) {
  setTheme("dark", { skipSave: true });
  addCheck();
  addAccount({ type: "Checking" });
  addAccount({ type: "Spending" });
  addAccount({ type: "High-Yield Savings" });
  addItem({ type: "expense" });
  refreshBudgetAccountSelectors();
  setActiveTab("checks", { skipSave: true });
  calculateAll();
}
