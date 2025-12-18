// Project card modal functionality
document.addEventListener('DOMContentLoaded', () => {
  const projectCards = document.querySelectorAll('.project-card');

  projectCards.forEach(card => {
    card.addEventListener('click', () => {
      const projectId = card.dataset.projectId;
      const modal = document.getElementById(`modal-${projectId}`);
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    });
  });

  const modalCloseButtons = document.querySelectorAll('.modal-close');
  modalCloseButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const modal = button.closest('.modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  });

  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  });
});
