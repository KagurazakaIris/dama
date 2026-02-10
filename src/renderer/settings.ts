const PATTERN_LABELS: Record<string, string> = {
  idCard: '身份证号',
  bankCard: '银行卡号',
  phone: '手机号',
  email: '电子邮箱',
  ipAddress: 'IP地址',
  passport: '护照号',
  licensePlate: '车牌号',
};

window.addEventListener('DOMContentLoaded', async () => {
  const settings = await window.damaAPI.getSettings();

  // Monitor toggle
  const monitorCheckbox = document.getElementById('opt-monitor') as HTMLInputElement;
  monitorCheckbox.checked = settings.monitorEnabled;

  // Auto process toggle
  const autoCheckbox = document.getElementById('opt-auto') as HTMLInputElement;
  autoCheckbox.checked = settings.autoProcess;

  // Pattern list
  const patternList = document.getElementById('pattern-list')!;
  for (const [key, label] of Object.entries(PATTERN_LABELS)) {
    const row = document.createElement('div');
    row.className = 'pattern-row';

    const span = document.createElement('span');
    span.textContent = label;

    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings.sensitivePatterns[key] !== false;
    input.dataset.key = key;

    const slider = document.createElement('span');
    slider.className = 'slider';

    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    row.appendChild(span);
    row.appendChild(switchLabel);
    patternList.appendChild(row);
  }

  // Save
  document.getElementById('btn-save')!.addEventListener('click', async () => {
    const patterns: Record<string, boolean> = {};
    patternList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const input = el as HTMLInputElement;
      if (input.dataset.key) {
        patterns[input.dataset.key] = input.checked;
      }
    });

    await window.damaAPI.saveSettings({
      monitorEnabled: monitorCheckbox.checked,
      autoProcess: autoCheckbox.checked,
      mosaicBlockSize: 10,
      sensitivePatterns: patterns,
    });
    window.damaAPI.closeSettings();
  });

  // Close
  document.getElementById('btn-close')!.addEventListener('click', () => {
    window.damaAPI.closeSettings();
  });
});
