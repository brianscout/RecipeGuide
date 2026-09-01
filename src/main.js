// Walking skeleton. No application state and no flow: this module exists to
// prove that ES modules load from GitHub Pages on the glasses and that the
// five platform inputs reach page code. It is replaced by the real entry
// point once the reducer lands.

const INPUTS = {
  ArrowLeft: 'Swipe left',
  ArrowRight: 'Swipe right',
  ArrowUp: 'Focus up',
  ArrowDown: 'Focus down',
  Enter: 'Pinch',
};

const readout = document.getElementById('readout');

document.addEventListener('keydown', (event) => {
  const label = INPUTS[event.key];
  if (!label) return;
  event.preventDefault();
  readout.textContent = label;
  readout.classList.remove('readout--dim');
});

readout.textContent = 'Ready';
readout.classList.add('readout--dim');
