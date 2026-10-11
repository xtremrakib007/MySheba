// What an IIMMPACT biller asks for, as Bill Payment's account and amount steps.
//
// Bill Payment used to ask every biller for one thing - "bill / account
// number" - and an amount. IIMMPACT's catalogue says what each product needs:
// a loan may want an IC number, a council its assessment number and a district,
// a biller with fixed packages a choice from a list. Sending only the account
// number got those orders refused by the provider.
//
// The biller's field list and fulfillment map are stored on serviceData when
// the biller is chosen (iimmpactFields / iimmpactFulfillment), so validateStep,
// which only sees serviceData, can hold the customer to them. Pure: no React,
// no network.

const s = (v) => (v == null ? '' : String(v));

/** The value a field holds: a typed value, or the chosen option. */
export function fieldValue(serviceData, id) {
  const chosen = serviceData?.selectedOptions?.[id];
  if (chosen && typeof chosen === 'object') return chosen;
  return serviceData?.fieldValues?.[id];
}

function shown(value) {
  if (value && typeof value === 'object') return s(value.code || value.account_number || value.value || value.label).trim();
  return s(value).trim();
}

/**
 * The biller's form, split the way the steps draw it: the field that is the
 * account (drawn as the account box, under the biller's own label), the field
 * that is the amount (drawn on the amount step), and everything else.
 */
export function billForm(serviceData) {
  const fields = (Array.isArray(serviceData?.iimmpactFields) ? serviceData.iimmpactFields : [])
    .filter((f) => f && f.id)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const fulfillment = serviceData?.iimmpactFulfillment || {};
  const accountId = s(fulfillment.account?.from_field);
  const amountId = s(fulfillment.amount?.from_field);
  const byId = (id) => fields.find((f) => s(f.id) === id) || null;
  return {
    active: fields.length > 0,
    account: byId(accountId),
    amount: byId(amountId),
    extra: fields.filter((f) => s(f.id) !== accountId && s(f.id) !== amountId),
  };
}

/** The first thing wrong with one field's answer, or ''. */
export function fieldError(field, value) {
  const label = s(field.label || field.name || field.id);
  const text = shown(value);
  if (!text) return field.required ? `Please enter ${label}.` : '';
  const rule = field.validation || {};
  if (rule.pattern && field.type !== 'select') {
    try {
      if (!new RegExp(rule.pattern).test(text)) return rule.message || `Please check ${label}.`;
    } catch (_) { /* a pattern we cannot compile is the provider's to enforce */ }
  }
  if (field.type === 'number' || field.type === 'money') {
    const n = Number(text);
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    if (rule.min != null && n < Number(rule.min)) return `${label} must be at least ${rule.min}.`;
    if (rule.max != null && n > Number(rule.max)) return `${label} must be at most ${rule.max}.`;
  }
  return '';
}

/** The account step: the account and every other field the biller asks for. */
export function accountStepError(serviceData) {
  const form = billForm(serviceData);
  if (!form.active) return '';
  const account = form.account
    ? fieldError({ ...form.account, required: true }, serviceData.accountNumber)
    : (s(serviceData.accountNumber).trim() ? '' : 'Please enter the bill or account number.');
  if (account) return account;
  for (const field of form.extra) {
    const error = fieldError(field, fieldValue(serviceData, s(field.id)));
    if (error) return error;
  }
  return '';
}

/** The amount step: a chosen package, or a typed amount within the biller's limits. */
export function amountStepError(serviceData) {
  const form = billForm(serviceData);
  if (!form.active || !form.amount) return '';
  if (form.amount.type === 'select') {
    return shown(fieldValue(serviceData, s(form.amount.id))) ? '' : `Please choose ${s(form.amount.label || 'an amount')}.`;
  }
  return fieldError({ ...form.amount, required: true }, serviceData.amount);
}

// IIMMPACT's documented extras - the only ones the server forwards.
const EXTRA_KEYS = ['subproduct_code', 'biller_code', 'ic_number', 'ref2'];

function pick(spec, serviceData) {
  if (!spec || !spec.from_field) return '';
  const id = s(spec.from_field);
  const value = id === s(serviceData?.iimmpactFulfillment?.account?.from_field) ? serviceData.accountNumber : fieldValue(serviceData, id);
  if (spec.path && value && typeof value === 'object') {
    return s(String(spec.path).split('.').reduce((v, key) => (v == null ? undefined : v[key]), value));
  }
  return shown(value);
}

/**
 * What the order carries for the provider: the extras its fulfillment map
 * names, and the chosen plan as subproductCode.
 */
export function billOrderFields(serviceData) {
  const form = billForm(serviceData);
  if (!form.active) return {};
  const fulfillment = serviceData.iimmpactFulfillment || {};
  const extras = {};
  for (const [key, spec] of Object.entries(fulfillment.extras || {})) {
    if (!EXTRA_KEYS.includes(key)) continue;
    const value = pick(spec, serviceData);
    if (value) extras[key] = value.slice(0, 300);
  }
  const plan = form.amount && form.amount.type === 'select' ? fieldValue(serviceData, s(form.amount.id)) : null;
  const subproductCode = extras.subproduct_code || (plan && typeof plan === 'object' ? s(plan.code) : '');
  return { extras, ...(subproductCode ? { subproductCode } : {}) };
}

/** The amount a chosen package costs, from its option. */
export function optionAmount(option) {
  const n = Number(option?.price?.amount ?? option?.denomination ?? option?.amount);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
