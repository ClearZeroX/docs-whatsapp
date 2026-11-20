# RupiahCepat SSO 自动登录油猴脚本技术方案与使用说明

> 首次写入工具：Codex
> 最近写入工具：Codex
> 日期：2026-11-19
> 文档状态：可用版本
> 适用脚本版本：2.1.0
> 脚本文件：`scripts/sso/rupahepat-sso-auto-login.user.js`

## 一、背景与目标

RupiahCepat 的测试环境和本地 CRM 入口在未登录时会先显示一个 Element UI 警告弹窗：

```text
Warning
You are not logged in, please log in first
Confirm
```

点击 `Confirm` 后跳转 SSO 登录页。SSO 页面使用一页式表单，包含：

- Email address
- Password
- Security Code
- Login

原始操作需要人工点击 CRM 弹窗、等待跳转、输入验证码并提交登录。该脚本的目标是将以下流程自动化：

```text
打开 CRM 首页
  → 自动点击未登录弹窗 Confirm
  → 跳转 SSO 登录页
  → 自动填入邮箱、密码
  → 本地生成 TOTP Security Code
  → 自动填入验证码
  → 自动点击 Login
  → 跳转回 CRM
```

脚本不修改 CRM 或 SSO 服务端逻辑，不调用额外的后端接口，也不读取其他浏览器扩展的内部数据。

## 二、适用入口

脚本当前匹配以下页面：

| 入口 | URL 匹配 |
| --- | --- |
| 印尼生产 CRM | `https://indonesia-whatsapp-crm.rupiahcepatweb.com/*` |
| 印尼测试 CRM | `https://indonesia-whatapp-crm-ve-test.rupiahcepatweb.com/*` |
| 本地 CRM | `http://localhost:1024/*` |
| 生产 SSO 登录页 | `https://sso.rupiahcepatweb.com/login*` |
| 兼容旧域名 SSO | `https://sso.rupahepatweb.com/login*` |

> 测试环境与生产环境必须严格区分。分享给同事前，应确认同事使用的是哪个环境，避免将生产账号配置给测试使用人。

## 三、实现原理

### 3.1 页面模式识别

脚本通过当前 `hostname` 区分 CRM 页面和 SSO 页面：

```text
CRM_HOSTS
  → indonesia-whatsapp-crm.rupiahcepatweb.com
  → indonesia-whatapp-crm-ve-test.rupiahcepatweb.com
  → localhost

其他匹配页面
  → 按 SSO 登录页处理
```

CRM 页面只执行“未登录弹窗确认”逻辑；SSO 页面只执行“表单填充与提交”逻辑，避免两类逻辑互相干扰。

### 3.2 CRM 未登录弹窗处理

脚本等待 Element UI 弹窗：

```text
.el-message-box
[role="dialog"]
```

然后检查弹窗文案是否包含：

```text
not logged in
please log in
请先登录
```

确认文案匹配后，在弹窗内部查找以下按钮：

```text
Confirm
确定
确认
```

按钮必须可见且未禁用，才会自动点击。

### 3.3 SSO 表单识别

SSO 页面实际 DOM 中，验证码输入框没有 `placeholder` 和可读标签，属性为：

```html
<input
  tabindex="1"
  type="number"
  autocomplete="on"
  name="verifyCode"
  maxlength="6"
  oninput="if(value.length>6)value=value.slice(0,6)"
  class="el-input__inner"
/>
```

因此脚本使用以下优先级定位验证码框：

1. `input[name="verifyCode"]`
2. `input[name="securityCode"]`
3. `input[id*="verifyCode" i]`
4. `input[autocomplete="one-time-code"]`
5. 页面文案 `security code`、`authenticator`、`one-time code`、`verification code`
6. `input[type="number"][maxlength="6"]`
7. `input[type="tel"]`

邮箱和密码使用以下属性识别：

```text
name=email
type=email
autocomplete=username
name=password
type=password
```

### 3.4 TOTP 生成

脚本按照 RFC 4226 / RFC 6238 实现 TOTP：

1. 将 Base32 Secret 解码为 HMAC 密钥；
2. 计算 `counter = floor(Date.now() / 1000 / period)`；
3. 使用 Web Crypto `HMAC` 生成签名；
4. 使用动态截断得到 6 位数字；
5. 在验证码窗口剩余不足 3 秒时等待下一个窗口，避免刚填入就过期。

默认参数：

```json
{
  "digits": 6,
  "period": 30,
  "algorithm": "SHA-1"
}
```

支持：

- 6 到 10 位验证码；
- SHA-1、SHA-256、SHA-512；
- 仅 Base32 Secret；
- 完整 `otpauth://totp/...` URI，自动读取其中的 `secret`、`digits`、`period`、`algorithm`。

### 3.5 配置存储

脚本支持两种配置来源：

1. Tampermonkey 用户脚本存储；
2. 脚本源码中的 `CONFIGURED_VALUES` 常量。

默认源码不包含真实凭据：

```javascript
const CONFIGURED_VALUES = {
  email: '',
  password: '',
  totp: '',
};
```

读取优先级：

```text
Tampermonkey 存储
  → 若存在则优先使用
  → 否则回退到 CONFIGURED_VALUES
```

这意味着可以共用同一份脚本、各自在 Tampermonkey 菜单中填写自己的账号。

### 3.6 防重复提交

脚本使用 `sessionStorage` 记录当前标签页的提交窗口：

```text
securityCodeCounter
securityCodeSubmittedAt
```

当同一 TOTP 时间窗口已经提交过，不会重复生成和点击。刷新标签页或重新登录后会重新执行。

### 3.7 页面状态提示

脚本在页面右上角显示状态提示，包括：

```text
Login required. Redirecting to SSO...
SSO auto login started...
Configuration saved. Reloading page...
SSO auto login failed: ...
```

失败时不会静默退出，便于判断是选择器变化、配置缺失还是账号问题。

## 四、完整源码

```javascript
// ==UserScript==
// @name         Rupahepat SSO Auto Login
// @namespace    https://sso.rupiahcepatweb.com/
// @version      2.1.0
// @description  Fill the Rupahepat SSO form, generate a TOTP code locally, and submit the login flow.
// @match        https://sso.rupiahcepatweb.com/login*
// @match        https://sso.rupahepatweb.com/login*
// @match        https://indonesia-whatsapp-crm.rupiahcepatweb.com/*
// @match        https://indonesia-whatapp-crm-ve-test.rupiahcepatweb.com/*
// @match        http://localhost:1024/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Populate this object in a local generated copy to avoid the first-run prompt.
  const CONFIGURED_VALUES = {
    email: '',
    password: '',
    totp: '',
  };
  const STORAGE_KEYS = {
    email: 'rupahepat.sso.email',
    password: 'rupahepat.sso.password',
    totp: 'rupahepat.sso.totp',
  };
  const SESSION_KEY = 'rupahepat.sso.autoLogin.session';
  const DEFAULTS = {
    digits: 6,
    period: 30,
    algorithm: 'SHA-1',
  };

  let statusElement = null;
  let statusTimer = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getStoredValue(key, fallback = '') {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallback);
      }
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function setStoredValue(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (error) {
      console.warn('[SSO Auto Login] Failed to save configuration:', error);
    }
  }

  function deleteStoredValue(key) {
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('[SSO Auto Login] Failed to clear configuration:', error);
    }
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function updateSession(patch) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...readSession(), ...patch }));
    } catch (error) {
      // Session storage only prevents duplicate submissions in this tab.
    }
  }

  function parseTotpConfig(rawValue) {
    const raw = String(rawValue || '').trim();
    const config = {
      secret: '',
      digits: DEFAULTS.digits,
      period: DEFAULTS.period,
      algorithm: DEFAULTS.algorithm,
    };

    if (!raw) {
      return config;
    }

    if (!/^otpauth:\/\//i.test(raw)) {
      config.secret = raw.replace(/[\s-]/g, '').toUpperCase();
      return config;
    }

    try {
      const url = new URL(raw);
      const secret = url.searchParams.get('secret') || '';
      const digits = Number(url.searchParams.get('digits'));
      const period = Number(url.searchParams.get('period'));
      const algorithm = String(url.searchParams.get('algorithm') || '').toUpperCase();

      config.secret = secret.replace(/[\s-]/g, '').toUpperCase();
      if (Number.isInteger(digits) && digits >= 6 && digits <= 10) {
        config.digits = digits;
      }
      if (Number.isFinite(period) && period > 0) {
        config.period = period;
      }
      if (['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
        config.algorithm = algorithm.replace(/^SHA(\d+)$/, 'SHA-$1');
      }
    } catch (error) {
      console.warn('[SSO Auto Login] Invalid otpauth URI:', error);
    }

    return config;
  }

  function readConfig() {
    return {
      email: String(getStoredValue(STORAGE_KEYS.email) || CONFIGURED_VALUES.email).trim(),
      password: String(getStoredValue(STORAGE_KEYS.password) || CONFIGURED_VALUES.password),
      totp: parseTotpConfig(getStoredValue(STORAGE_KEYS.totp) || CONFIGURED_VALUES.totp),
    };
  }

  function showStatus(message, isError = false, duration = 7000) {
    console[isError ? 'warn' : 'info'](`[SSO Auto Login] ${message}`);

    if (!statusElement) {
      statusElement = document.createElement('div');
      statusElement.style.cssText = [
        'position:fixed',
        'top:16px',
        'right:16px',
        'z-index:2147483647',
        'max-width:400px',
        'padding:10px 14px',
        'border-radius:8px',
        'box-shadow:0 4px 18px rgba(0,0,0,.2)',
        'font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'color:#fff',
        'white-space:pre-wrap',
        'pointer-events:none',
      ].join(';');
      document.documentElement.appendChild(statusElement);
    }

    statusElement.style.background = isError ? '#b42318' : '#175cd3';
    statusElement.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      if (statusElement) {
        statusElement.remove();
        statusElement = null;
      }
    }, duration);
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function waitFor(fn, timeout = 15000, interval = 250) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const check = () => {
        let result = null;
        try {
          result = fn();
        } catch (error) {
          result = null;
        }

        if (result) {
          resolve(result);
          return;
        }

        if (Date.now() - startedAt >= timeout) {
          resolve(null);
          return;
        }

        setTimeout(check, interval);
      };

      check();
    });
  }

  function getLabelText(input) {
    const text = [];

    if (input.labels) {
      text.push(...Array.from(input.labels, (label) => label.textContent || ''));
    }

    if (input.id) {
      const label = Array.from(document.querySelectorAll('label')).find(
        (item) => item.htmlFor === input.id,
      );
      if (label) {
        text.push(label.textContent || '');
      }
    }

    const container = input.closest(
      '.ant-form-item, .el-form-item, .form-item, .form-group, fieldset, label',
    );
    if (container) {
      text.push(container.textContent || '');
    }

    return text.join(' ').toLowerCase();
  }

  function findInputByText(text) {
    const needle = text.toLowerCase();
    const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);

    for (const input of inputs) {
      const haystack = [
        input.id,
        input.name,
        input.placeholder,
        input.getAttribute('aria-label'),
        input.getAttribute('autocomplete'),
        getLabelText(input),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (haystack.includes(needle)) {
        return input;
      }
    }

    return null;
  }

  function findEmailInput() {
    return (
      findInputByText('email address') ||
      findInputByText('email') ||
      Array.from(document.querySelectorAll('input[type="email"]')).find(isVisible) ||
      Array.from(document.querySelectorAll('input[autocomplete="username"]')).find(isVisible)
    );
  }

  function findPasswordInput() {
    return (
      Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible) ||
      findInputByText('password')
    );
  }

  function findSecurityCodeInput() {
    const directMatch = document.querySelector(
      'input[name="verifyCode"], input[name="securityCode"], input[id*="verifyCode" i], input[autocomplete="one-time-code"]',
    );
    if (directMatch && isVisible(directMatch)) {
      return directMatch;
    }

    const semanticMatch =
      findInputByText('security code') ||
      findInputByText('authenticator') ||
      findInputByText('one-time code') ||
      findInputByText('verification code');
    if (semanticMatch) {
      return semanticMatch;
    }

    // This SSO page uses an unlabeled number input named verifyCode.
    return Array.from(
      document.querySelectorAll('input[type="number"][maxlength="6"], input[type="tel"]'),
    ).find(isVisible) || null;
  }

  function getButtonText(button) {
    return String(button.innerText || button.value || button.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isDisabled(button) {
    return (
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.classList.contains('disabled') ||
      button.classList.contains('is-disabled')
    );
  }

  function findLoginButton() {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], [role="button"], .ant-btn, .el-button',
      ),
    ).filter(isVisible);

    return (
      candidates.find((button) => /^login$/i.test(getButtonText(button))) ||
      candidates.find((button) => /log\s*in/i.test(getButtonText(button))) ||
      candidates.find((button) => button.type === 'submit') ||
      null
    );
  }

  function findEnabledLoginButton() {
    const button = findLoginButton();
    return button && !isDisabled(button) ? button : null;
  }

  function clickElement(element) {
    element.focus?.();
    element.click?.();
  }

  function setInputValue(input, value) {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    const setter = descriptor && descriptor.set;

    input.focus?.();
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }

    // React and similar frameworks require native input events after setting value.
    try {
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        }),
      );
    } catch (error) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur?.();
  }

  function base32Decode(secret) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const normalized = String(secret)
      .replace(/[\s-]/g, '')
      .replace(/=+$/g, '')
      .toUpperCase();

    if (!normalized) {
      throw new Error('TOTP secret is empty');
    }

    let buffer = 0;
    let bits = 0;
    const bytes = [];

    for (const character of normalized) {
      const value = alphabet.indexOf(character);
      if (value < 0) {
        throw new Error(`Invalid Base32 character: ${character}`);
      }

      buffer = (buffer << 5) | value;
      bits += 5;

      if (bits >= 8) {
        bytes.push((buffer >>> (bits - 8)) & 0xff);
        bits -= 8;
        buffer &= bits === 0 ? 0 : (1 << bits) - 1;
      }
    }

    return Uint8Array.from(bytes);
  }

  function normalizeAlgorithm(algorithm) {
    const normalized = String(algorithm).toUpperCase().replace(/^SHA(\d+)$/, 'SHA-$1');
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(normalized)) {
      throw new Error(`Unsupported TOTP algorithm: ${algorithm}`);
    }
    return normalized;
  }

  async function generateTotp(config) {
    const period = Math.max(1, Number(config.period) || DEFAULTS.period);
    const counter = Math.floor(Date.now() / 1000 / period);
    const key = await crypto.subtle.importKey(
      'raw',
      base32Decode(config.secret),
      { name: 'HMAC', hash: normalizeAlgorithm(config.algorithm) },
      false,
      ['sign'],
    );

    // RFC 4226 requires the moving factor to be encoded as a big-endian uint64.
    const message = new ArrayBuffer(8);
    new DataView(message).setBigUint64(0, BigInt(counter), false);
    const signature = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, message),
    );
    const offset = signature[signature.length - 1] & 0x0f;
    const binary =
      ((signature[offset] & 0x7f) << 24) |
      ((signature[offset + 1] & 0xff) << 16) |
      ((signature[offset + 2] & 0xff) << 8) |
      (signature[offset + 3] & 0xff);
    const digits = Math.min(10, Math.max(6, Number(config.digits) || DEFAULTS.digits));
    return String(binary % 10 ** digits).padStart(digits, '0');
  }

  function getTotpCounter(period) {
    return Math.floor(Date.now() / 1000 / Math.max(1, Number(period) || DEFAULTS.period));
  }

  async function waitForFreshTotpWindow(period) {
    const normalizedPeriod = Math.max(1, Number(period) || DEFAULTS.period);
    const remaining = normalizedPeriod - (Date.now() / 1000) % normalizedPeriod;
    if (remaining <= 3) {
      await sleep((remaining + 0.5) * 1000);
    }
  }

  async function fillCredentials(config) {
    const emailInput = await waitFor(findEmailInput, 15000);
    const passwordInput = await waitFor(findPasswordInput, 15000);

    if (!emailInput || !passwordInput) {
      throw new Error('Email or password input was not found');
    }

    if (config.email && emailInput.value !== config.email) {
      setInputValue(emailInput, config.email);
    }
    if (config.password && passwordInput.value !== config.password) {
      setInputValue(passwordInput, config.password);
    }

    const credentialsReady = await waitFor(
      () => findEmailInput()?.value && findPasswordInput()?.value,
      15000,
    );
    if (!credentialsReady) {
      throw new Error(
        'Email or password is empty. Save them in the script menu or let the browser fill them first',
      );
    }
  }

  async function fillSecurityCode(input, config) {
    if (!config.totp.secret) {
      throw new Error(
        'TOTP secret is not configured. Open the Tampermonkey menu and run Configure SSO Auto Login',
      );
    }

    input.setAttribute('autocomplete', 'one-time-code');
    input.setAttribute('inputmode', 'numeric');

    const period = Math.max(1, Number(config.totp.period) || DEFAULTS.period);
    const counter = getTotpCounter(period);
    const session = readSession();
    if (
      session.securityCodeCounter === counter &&
      Date.now() - Number(session.securityCodeSubmittedAt || 0) < period * 1000
    ) {
      return;
    }

    await waitForFreshTotpWindow(period);
    setInputValue(input, await generateTotp(config.totp));
  }

  async function submitLogin(config, phase) {
    const loginButton = await waitFor(findEnabledLoginButton, 12000);
    if (!loginButton) {
      throw new Error(`The ${phase} Login button was not found or stayed disabled`);
    }

    if (phase === 'security-code') {
      updateSession({
        securityCodeCounter: getTotpCounter(config.totp.period),
        securityCodeSubmittedAt: Date.now(),
      });
    } else {
      updateSession({ credentialsSubmittedAt: Date.now() });
    }

    clickElement(loginButton);
  }

  function openConfigurationDialog() {
    const current = readConfig();

    const email = window.prompt(
      'Email address:',
      current.email,
    );
    if (email === null) {
      return;
    }

    const password = window.prompt(
      'Password (leave blank to keep the current value):',
      '',
    );
    if (password === null) {
      return;
    }

    const totp = window.prompt(
      'TOTP Base32 secret or otpauth:// URI (leave blank to keep the current value):',
      '',
    );
    if (totp === null) {
      return;
    }

    setStoredValue(STORAGE_KEYS.email, email.trim());
    if (password) {
      setStoredValue(STORAGE_KEYS.password, password);
    }
    if (totp.trim()) {
      setStoredValue(STORAGE_KEYS.totp, totp.trim());
    }

    showStatus('Configuration saved. Reloading page...', false, 3000);
    window.setTimeout(() => window.location.reload(), 500);
  }

  function showConfigurationStatus() {
    const config = readConfig();
    const lines = [
      `Auto login: ${config.email && config.totp.secret ? 'configured' : 'incomplete'}`,
      `Email: ${config.email || 'not configured'}`,
      `Password: ${config.password ? 'saved in userscript' : 'use Chrome autofill'}`,
      `TOTP secret: ${config.totp.secret ? 'configured' : 'not configured'}`,
      `Current page: ${window.location.hostname}${window.location.pathname}`,
    ];
    showStatus(lines.join('\n'), !config.totp.secret, 12000);
  }

  function clearConfiguration() {
    if (!window.confirm('Clear the saved SSO email, password, and TOTP secret?')) {
      return;
    }

    Object.values(STORAGE_KEYS).forEach(deleteStoredValue);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      // Ignore unavailable session storage.
    }
    showStatus('Configuration cleared.', true);
  }

  function registerConfigurationMenu() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }

    GM_registerMenuCommand('Configure SSO Auto Login', openConfigurationDialog);
    GM_registerMenuCommand('Show SSO Auto Login Status', showConfigurationStatus);
    GM_registerMenuCommand('Clear SSO Auto Login Configuration', clearConfiguration);
  }

  const CRM_HOSTS = new Set([
    'indonesia-whatsapp-crm.rupiahcepatweb.com',
    'indonesia-whatapp-crm-ve-test.rupiahcepatweb.com',
    'localhost',
  ]);

  function isCrmPage() {
    return CRM_HOSTS.has(window.location.hostname);
  }

  function findLoginRequiredConfirmButton() {
    const messageBoxes = Array.from(
      document.querySelectorAll('.el-message-box, [role="dialog"]'),
    ).filter(isVisible);

    for (const messageBox of messageBoxes) {
      const text = String(messageBox.textContent || '').toLowerCase();
      if (
        text.includes('not logged in') ||
        text.includes('please log in') ||
        text.includes('请先登录')
      ) {
        const button = Array.from(messageBox.querySelectorAll('button')).find(
          (item) => /^(confirm|确定|确认)$/i.test(getButtonText(item)),
        );
        if (button && !isDisabled(button)) {
          return button;
        }
      }
    }

    return null;
  }

  async function handleCrmRedirect() {
    const confirmButton = await waitFor(findLoginRequiredConfirmButton, 12000);
    if (!confirmButton) {
      return false;
    }

    showStatus('Login required. Redirecting to SSO...', false, 4000);
    clickElement(confirmButton);
    return true;
  }

  async function run() {
    const config = readConfig();

    if (isCrmPage()) {
      await handleCrmRedirect();
      return;
    }

    showStatus('SSO auto login started...', false, 4000);

    const initialStage = await waitFor(() => {
      const securityCodeInput = findSecurityCodeInput();
      if (securityCodeInput) {
        return { type: 'security-code', securityCodeInput };
      }

      const emailInput = findEmailInput();
      const passwordInput = findPasswordInput();
      if (emailInput && passwordInput) {
        return { type: 'credentials' };
      }

      return null;
    }, 20000);

    if (!initialStage) {
      throw new Error('Login form not found. The site layout may have changed');
    }

    // Some SSO flows render credentials and the security code on the same page.
    if (initialStage.type === 'security-code') {
      if (findEmailInput() && findPasswordInput()) {
        await fillCredentials(config);
      }
      await fillSecurityCode(initialStage.securityCodeInput, config);
      await submitLogin(config, 'security-code');
      return;
    }

    await fillCredentials(config);
    await submitLogin(config, 'credentials');

    const securityCodeInput = await waitFor(findSecurityCodeInput, 20000);
    if (!securityCodeInput) {
      throw new Error('Security Code input was not displayed after the first login step');
    }

    await fillSecurityCode(securityCodeInput, config);
    await submitLogin(config, 'security-code');
  }

  registerConfigurationMenu();
  run().catch((error) => {
    console.error('[SSO Auto Login]', error);
    showStatus(`SSO auto login failed: ${error.message || error}`, true, 12000);
  });
})();
```

## 五、安装与配置流程

### 5.1 安装 Tampermonkey

1. 在 Chrome 打开 `chrome://extensions`；
2. 安装并启用“篡改猴 / Tampermonkey”；
3. 打开 Tampermonkey 详情；
4. 确认“允许用户脚本”已开启；
5. 确认扩展可以访问所有网站。

当前环境已经确认：

```text
user_scripts_enabled: true
```

如果菜单仍显示旧的“请启用允许用户脚本”提示，可以先关闭提示并刷新页面。

### 5.2 安装脚本

推荐使用“删除旧版后重新导入”，不要直接覆盖旧代码，避免旧版内容拼接导致版本元数据重复。

1. 打开 Tampermonkey 管理面板；
2. 删除旧的 `Rupahepat SSO Auto Login`；
3. 把 `rupahepat-sso-auto-login.user.js` 文件拖入 Chrome；
4. 在 Tampermonkey 安装页点击“安装”；
5. 确认版本显示为 `2.1.0`；
6. 确认脚本已启用。

### 5.3 同事首次使用前需要替换的信息

随文档提供的脚本是未配置凭据的通用版本。同事安装后必须替换成自己的账号信息：

| 配置项 | 是否必须替换 | 说明 |
| --- | --- | --- |
| Email address | 是 | 填自己的 SSO 账号 |
| Password | 是 | 自己的 SSO 密码；也可交给 Chrome 密码管理器 |
| TOTP Secret / `otpauth://` URI | 是 | 自己账号对应的长期密钥，不是 6 位动态码 |

如果分享的是已经写入真实凭据的脚本，必须把以下内容视为敏感文件：

- Password；
- TOTP Secret；
- 完整 `otpauth://` URI；
- 认证器二维码和导出备份；
- 浏览器 Cookie、Local Storage 和 Chrome 用户数据目录。

敏感文件应使用 AES-256 加密压缩包传输，压缩包密码通过另一条渠道单独发送。不要把密码和压缩包放在同一条聊天消息中。

推荐做法是分享未配置的脚本，由同事自行填写自己的账号信息，而不是分发包含个人长期凭据的版本。

### 5.4 配置账号参数

1. 打开任一 CRM 入口或 SSO 登录页；
2. 点击 Tampermonkey 图标；
3. 点击 `Configure SSO Auto Login`；
4. 填写 Email address；
5. 填写 Password；
6. 填写 TOTP Base32 Secret 或完整 `otpauth://` URI；
7. 保存后脚本自动刷新页面。

如果 Password 留空，但仍希望脚本执行自动填充，则需要在 Chrome 密码管理器中提前保存该站点密码，或直接在脚本配置中写入密码。

脚本使用 `GM_setValue` 保存配置时，建议关闭本脚本的 Tampermonkey 同步，或每台设备单独配置，避免密码和 TOTP Secret 自动同步到其他设备。

### 5.5 检查配置

在 Tampermonkey 菜单中选择：

```text
Show SSO Auto Login Status
```

正常状态应显示：

```text
Auto login: configured
Email: ...
TOTP secret: configured
```

### 5.6 测试流程

1. 退出 SSO；
2. 打开 CRM 首页；
3. 确认出现未登录警告；
4. 观察脚本是否自动点击 `Confirm`；
5. 观察 SSO 表单是否自动填充；
6. 观察登录是否完成并回到 CRM。

## 六、TOTP 获取方式

### 6.1 从现有身份验证器获取

当前使用的身份验证器为 `Authenticator`（扩展 ID：`bhghoamapcdpbohphigoooaddinpkbai`）。该扩展提供账号二维码按钮。

安全步骤：

1. 打开“身份验证器”；
2. 找到 `ridho1@rupiahcepat.co.id`；
3. 点击该账号的二维码按钮；
4. 用本地离线二维码工具读取二维码；
5. 取 `otpauth://totp/...?secret=...` 中的 `secret`；
6. 不要上传二维码到在线网站；
7. 不要将二维码或 Secret 发到聊天、邮件或共享文档；
8. 使用完成后关闭二维码并删除临时截图。

### 6.2 不要混淆动态码和 Secret

- 当前显示的 6 位数字是动态码；
- 脚本需要的是长期 Base32 Secret；
- 动态码只在当前 30 秒窗口有效，不能配置为脚本 Secret。

## 七、版本与变更记录

### 2.1.0

- 增加 CRM 未登录弹窗自动确认；
- 支持生产、测试、本地三个 CRM 入口；
- 保留 SSO 自动登录流程；
- 最低权限匹配，降低误点风险。

### 2.0.2

- 识别 `input[name="verifyCode"]`；
- 兼容无 placeholder 的数字验证码输入框；
- 修复一页式 SSO 表单被误判为第一阶段的问题。

### 2.0.1

- 增加 `sso.rupiahcepatweb.com` 域名匹配；
- 修复域名不匹配导致 Tampermonkey 显示“没有运行中的脚本”。

### 2.0.0

- 移除读取外部验证器弹窗方案；
- 改为在脚本内本地生成 TOTP；
- 增加配置菜单和状态菜单。

## 八、验证记录

已完成：

- `node --check scripts/sso/rupahepat-sso-auto-login.user.js`
- 检查脚本元数据：
  - 版本 `2.1.0`
  - 匹配生产、测试、本地 CRM
  - 匹配生产 SSO
- 确认源码不含真实密码或 TOTP Secret
- 检查当前配置：
  - Tampermonkey `user_scripts_enabled: true`
- 检查 SSO 实际 DOM：
  - 邮箱输入框：`name="email"`
  - 密码输入框：`name="password"`
  - 验证码输入框：`name="verifyCode"`、`type="number"`
- 检查 CRM 实际 DOM：
  - 弹窗：`.el-message-box`
  - 确认按钮：`.el-message-box__btns button`
  - 文本：`You are not logged in, please log in first`

尚未完成：

- 使用真实账号进行端到端登录测试；
- 验证 TOTP Secret 与 SSO 当前账号绑定关系；
- 验证生产环境和测试环境使用不同账号时的配置隔离。

## 九、回滚方案

出现以下情况时应回滚：

- SSO 页面选择器变化导致脚本误填；
- CRM 增加新的确认弹窗导致误点击；
- TOTP 配置错误导致验证码失败；
- 需要恢复手工登录。

回滚步骤：

1. 打开 Tampermonkey 管理面板；
2. 禁用或删除 `Rupahepat SSO Auto Login`；
3. 清理脚本配置；
4. 刷新 CRM 和 SSO 页面；
5. 使用原身份验证器手动登录。

## 十、安全注意事项

1. 不要把真实密码或 TOTP Secret 写入公开代码仓库；
2. 分享脚本时优先使用未配置凭据的通用版本；
3. 若必须分享已配置版本，应删除个人凭据或使用 AES-256 加密压缩包传输；
4. 密码和压缩包解密口令应通过不同渠道分别发送；
5. 测试环境和生产环境应使用不同的账号与 Secret；
6. 发现 Secret 泄露时，立即在 SSO 侧重新绑定 MFA；
7. 轮换 Secret 后，需要重新配置脚本；
8. 原身份验证器扩展可继续保留，手动登录方式不受影响；
9. 定期检查 Tampermonkey 权限和脚本版本；
10. 不要把浏览器 Cookie 或完整用户数据目录交给他人。

## 十一、交付清单

| 文件 | 用途 |
| --- | --- |
| `scripts/sso/rupahepat-sso-auto-login.user.js` | 未配置凭据的脚本源码 |
| `docs/需求文档&技术方案/2026/2026-11-19-RupiahCepat-SSO自动登录油猴脚本技术方案与使用说明.md` | 技术方案、操作流程与安全说明 |

脚本 SHA-256：

```text
14515cc151eda3f7e1472ff903cdaea6d34e7437e73f0cf465342a7eb42e5d15
```
