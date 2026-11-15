import { narrate } from './index';
import { NARRATION } from '../data/narration';
const controls = document.querySelector('#preview-controls')!;
for (const key of Object.keys(NARRATION)) {
  const button = document.createElement('button');
  button.textContent =
    key === 'oracle' ? 'Meet the Oracle' : key.charAt(0).toUpperCase() + key.slice(1);
  button.onclick = () => narrate(key);
  controls.append(button);
}
