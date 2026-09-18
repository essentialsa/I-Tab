import { getConfig, saveConfig, PROVIDER_PRESETS } from '../services/storage';
import { testConnection } from '../services/llm';
import { LLMConfig } from '../types';

const providerSelect = document.getElementById('provider-select') as HTMLSelectElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const baseUrlInput = document.getElementById('base-url-input') as HTMLInputElement;
const modelInput = document.getElementById('model-input') as HTMLInputElement;
const autoCollapseInput = document.getElementById('auto-collapse-input') as HTMLInputElement;
const autoOrganizeInput = document.getElementById('auto-organize-input') as HTMLInputElement;
const autoThresholdInput = document.getElementById('auto-threshold-input') as HTMLInputElement;
const thresholdContainer = document.getElementById('threshold-container') as HTMLDivElement;
const toggleKeyBtn = document.getElementById('toggle-key-btn') as HTMLButtonElement;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement;
const form = document.getElementById('settings-form') as HTMLFormElement;
const statusAlert = document.getElementById('status-alert') as HTMLDivElement;
const keyHint = document.getElementById('key-hint') as HTMLParagraphElement;

function showAlert(message: string, type: 'success' | 'error') {
  statusAlert.textContent = message;
  statusAlert.className = `status-alert ${type}`;
  statusAlert.style.display = 'block';
}

function hideAlert() {
  statusAlert.style.display = 'none';
}

function updateProviderHints(provider: string) {
  if (provider === 'deepseek') {
    keyHint.innerHTML =
      '获取 DeepSeek Key: <a href="https://platform.deepseek.com/" target="_blank">platform.deepseek.com</a>';
  } else if (provider === 'qwen') {
    keyHint.innerHTML =
      '获取通义千问 Key (阿里百炼): <a href="https://bailian.console.aliyun.com/" target="_blank">bailian.console.aliyun.com</a>';
  } else {
    keyHint.textContent = '请输入兼容 OpenAI Chat Completions 规范的 API 凭证';
  }
}

async function init() {
  const config = await getConfig();

  providerSelect.value = config.provider;
  const preset =
    config.provider === 'deepseek' || config.provider === 'qwen'
      ? PROVIDER_PRESETS[config.provider]
      : null;
  apiKeyInput.value = config.apiKey || '';
  baseUrlInput.value = config.baseUrl || (preset?.baseUrl ?? '');
  modelInput.value = config.model || (preset?.model ?? '');
  autoCollapseInput.checked = config.autoCollapse;
  autoOrganizeInput.checked = config.autoOrganizeEnabled ?? true;
  autoThresholdInput.value = String(config.autoOrganizeThreshold ?? 6);

  if (thresholdContainer) {
    thresholdContainer.style.display = autoOrganizeInput.checked ? 'block' : 'none';
  }

  autoOrganizeInput.addEventListener('change', () => {
    if (thresholdContainer) {
      thresholdContainer.style.display = autoOrganizeInput.checked ? 'block' : 'none';
    }
  });

  updateProviderHints(config.provider);

  // 切换提供商时，仅在用户主动改变下拉框时填入预设
  providerSelect.addEventListener('change', () => {
    const selected = providerSelect.value;
    updateProviderHints(selected);
    if (selected === 'deepseek' || selected === 'qwen') {
      baseUrlInput.value = PROVIDER_PRESETS[selected].baseUrl;
      modelInput.value = PROVIDER_PRESETS[selected].model;
    }
  });

  // 显隐密码
  toggleKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyBtn.textContent = '👁️';
    }
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    hideAlert();
    const currentConfig: LLMConfig = {
      provider: providerSelect.value as any,
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      model: modelInput.value.trim(),
      autoCollapse: autoCollapseInput.checked,
      autoOrganizeEnabled: autoOrganizeInput.checked,
      autoOrganizeThreshold: Math.max(2, parseInt(autoThresholdInput.value, 10) || 6),
    };

    const originText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '<span>⏳</span> 正在测试...';

    const result = await testConnection(currentConfig);
    testBtn.disabled = false;
    testBtn.innerHTML = originText;

    if (result.success) {
      showAlert(result.message, 'success');
    } else {
      showAlert(result.message, 'error');
    }
  });

  // 表单保存
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const newConfig: LLMConfig = {
      provider: providerSelect.value as any,
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      model: modelInput.value.trim(),
      autoCollapse: autoCollapseInput.checked,
      autoOrganizeEnabled: autoOrganizeInput.checked,
      autoOrganizeThreshold: Math.max(2, parseInt(autoThresholdInput.value, 10) || 6),
    };

    await saveConfig(newConfig);
    showAlert('配置保存成功！现在可按下 Cmd+Shift+G 或点击插件图标开始整理。', 'success');
  });
}

document.addEventListener('DOMContentLoaded', init);
