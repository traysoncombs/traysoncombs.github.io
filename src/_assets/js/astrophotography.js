// Configuration
const INDEX_JSON_URL = '/static/index.json';

// Utility to extract date from filename
function createDate(date) {
  const match = date.match(/^(\d{8})/);
  if (match) {
    const dateStr = match[1];
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(year, month - 1, day);
  }
  return new Date(0); // Epoch for sorting
}

const gallery = {
  el: null,
  images: [],

  async init() {
    this.el = document.querySelector('.gallery-grid');
    const configLoaded = await this.loadConfig();

    if (!configLoaded || this.images.length === 0) {
      this.el.innerHTML = '<p class="text-primary-text text-center w-full p-8">Unable to load gallery images. Please check the configuration.</p>';
      return;
    }

    this.render();
    this.initLazyLoading();
  },

  async loadConfig() {
    try {
      const response = await fetch(INDEX_JSON_URL);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const config = await response.json();
      this.images = config.sort((a, b) => createDate(b.date) - createDate(a.date));
      return true;
    } catch (error) {
      console.error('Error loading gallery configuration:', error);
      return false;
    }
  },

  render() {
    this.images.forEach((image, index) => {
      const galleryItem = document.createElement('div');
      galleryItem.className = 'gallery-item';

      const aspectRatio = image.width && image.height ? image.width / image.height : 1;
      const imageArea = image.width * image.height;
      const isLargeImage = imageArea > 25000000;

      let colSpan = 1, rowSpan = 1;
      if (isLargeImage && aspectRatio > 0.65 && aspectRatio < 1.6) {
        colSpan = 2; rowSpan = 2;
      } else if (aspectRatio > 1.7) {
        colSpan = 2;
      } else if (aspectRatio < 0.8) {
        rowSpan = 2;
      }

      galleryItem.style.gridColumn = `span ${colSpan}`;
      galleryItem.style.gridRow = `span ${rowSpan}`;

      // Eager load the first 10 images for better initial performance
      const isEager = index < 10;
      const srcAttr = isEager ? `src="${image.thumbnail}"` : `data-src="${image.thumbnail}"`;
      const className = isEager ? 'gallery-thumbnail loaded' : 'gallery-thumbnail lazy';
      const loadingMode = isEager ? 'eager' : 'lazy';

      galleryItem.innerHTML = `
        <img ${srcAttr} alt="${image.title}" class="${className}" loading="${loadingMode}">
        <div class="gallery-overlay"><span class="gallery-title">${image.title}</span></div>
      `;

      galleryItem.addEventListener('click', () => lightbox.open(index));
      this.el.appendChild(galleryItem);
    });
  },

  initLazyLoading() {
    const lazyImages = this.el.querySelectorAll('img.lazy');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            img.classList.add('loaded');
            obs.unobserve(img);
          }
        });
      });
      lazyImages.forEach(img => observer.observe(img));
    } else {
      lazyImages.forEach(img => {
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        img.classList.add('loaded');
      });
    }
  }
};

const lightbox = {
  el: null,
  imageEl: null,
  loaderEl: null,
  titleEl: null,
  descriptionEl: null,
  dateEl: null,
  photoDetailsEl: null,
  equipmentEl: null,
  photoDetailsContainerEl: null,
  equipmentContainerEl: null,
  detailsToggleEl: null,
  detailsEl: null,
  navPrevEl: null,
  navNextEl: null,
  infoEl: null,
  currentIndex: 0,

  // Interaction state
  state: {
    zoom: 1,
    isDragging: false,
    hasPanned: false,
    start: { x: 0, y: 0 },
    translate: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    pinch: {
      initialDistance: 0,
      initialZoom: 1,
    }
  },

  init() {
    this.el = document.getElementById('lightbox');
    this.imageEl = document.getElementById('lightbox-image');
    this.loaderEl = document.getElementById('lightbox-loader');
    this.titleEl = document.getElementById('lightbox-title');
    this.descriptionEl = document.getElementById('lightbox-description');
    this.dateEl = document.getElementById('lightbox-date');
    this.photoDetailsEl = document.getElementById('lightbox-photo-details');
    this.equipmentEl = document.getElementById('lightbox-equipment');
    this.photoDetailsContainerEl = document.getElementById('lightbox-photo-details-container');
    this.equipmentContainerEl = document.getElementById('lightbox-equipment-container');
    this.detailsToggleEl = document.getElementById('details-toggle');
    this.detailsEl = document.getElementById('lightbox-details');
    this.navPrevEl = document.getElementById('lightbox-prev');
    this.navNextEl = document.getElementById('lightbox-next');
    this.infoEl = document.querySelector('.lightbox-info');

    document.getElementById('lightbox-close').addEventListener('click', () => this.close());
    this.navPrevEl.addEventListener('click', () => this.showPrev());
    this.navNextEl.addEventListener('click', () => this.showNext());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    this.detailsToggleEl.addEventListener('click', () => this.toggleDetails());

    this.addEventListeners();
  },

  open(index) {
    if (gallery.images.length === 0) return;
    this.currentIndex = index;
    const image = gallery.images[this.currentIndex];

    this.loaderEl.classList.remove('hidden');
    this.imageEl.style.opacity = '0';

    this.imageEl.onload = () => {
      this.loaderEl.classList.add('hidden');
      this.imageEl.style.opacity = '1';
    };

    this.imageEl.src = image.fullRes;
    this.titleEl.textContent = image.title;
    this.descriptionEl.textContent = image.description;

    const dateStr = image.date;
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    this.dateEl.textContent = `${month}/${day}/${year}`;

    this.photoDetailsEl.innerHTML = '';
    this.equipmentEl.innerHTML = '';

    const createDetailList = (obj, parentEl, containerEl) => {
      let itemsAdded = 0;
      if (obj) {
        for (const key in obj) {
          if (obj[key] !== -1 && obj[key] !== '') {
            itemsAdded++;
            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            let value = obj[key];
            if (key === 'exposure_length') {
              value += ' seconds';
            } else if (key === 'integration_time') {
              value += ' minutes';
            }
            const li = document.createElement('li');
            li.innerHTML = `<strong>${formattedKey}:</strong> ${value}`;
            parentEl.appendChild(li);
          }
        }
      }
      if (containerEl) {
        containerEl.style.display = itemsAdded > 0 ? '' : 'none';
      }
    };

    createDetailList(image.photo_details, this.photoDetailsEl, this.photoDetailsContainerEl);
    createDetailList(image.equipment, this.equipmentEl, this.equipmentContainerEl);

    this.detailsEl.classList.add('hidden');
    this.detailsToggleEl.textContent = 'Show Details';

    this.resetZoom();
    this.el.classList.remove('hidden');
    this.el.classList.add('flex');
    document.body.style.overflow = 'hidden';
  },

  close() {
    this.el.classList.add('hidden');
    this.el.classList.remove('flex');
    document.body.style.overflow = '';
    this.resetZoom();
		this.imageEl.src = '';
    this.loaderEl.classList.add('hidden');
  },

  toggleDetails() {
    const isHidden = this.detailsEl.classList.toggle('hidden');
    this.detailsToggleEl.textContent = isHidden ? 'Show Details' : 'Hide Details';
  },

  showPrev() {
    this.currentIndex = (this.currentIndex - 1 + gallery.images.length) % gallery.images.length;
    this.open(this.currentIndex);
  },

  showNext() {
    this.currentIndex = (this.currentIndex + 1) % gallery.images.length;
    this.open(this.currentIndex);
  },

  resetZoom() {
    this.state.zoom = 1;
    this.state.translate = { x: 0, y: 0 };
    this.state.isDragging = false;
    this.state.hasPanned = false;
    this.updateImageTransform();
  },

  updateImageTransform() {
    const { zoom, translate } = this.state;

    if (zoom > 1) {
      const container = this.imageEl.parentElement;
      const maxTranslateX = Math.max(0, (this.imageEl.offsetWidth * zoom - container.clientWidth) / 2);
      const maxTranslateY = Math.max(0, (this.imageEl.offsetHeight * zoom - container.clientHeight) / 2);

      translate.x = Math.max(-maxTranslateX, Math.min(maxTranslateX, translate.x));
      translate.y = Math.max(-maxTranslateY, Math.min(maxTranslateY, translate.y));

      this.imageEl.style.cursor = 'grab';
      this.toggleUi(false);
    } else {
      translate.x = 0;
      translate.y = 0;
      this.imageEl.style.cursor = 'zoom-in';
      this.toggleUi(true);
    }

    this.imageEl.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`;
  },

  toggleUi(show) {
    const elements = [this.navPrevEl, this.navNextEl, this.infoEl];
    elements.forEach(el => {
      if (el) {
        if (show) {
          el.classList.remove('opacity-0', 'pointer-events-none');
        } else {
          el.classList.add('opacity-0', 'pointer-events-none');
        }
      }
    });
  },

  addEventListeners() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.el.classList.contains('hidden')) {
        if (e.key === 'Escape') this.close();
        if (e.key === 'ArrowLeft') this.showPrev();
        if (e.key === 'ArrowRight') this.showNext();
      }
    });

    // Mouse
    this.imageEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.state.hasPanned) return;

      const rect = this.imageEl.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;

      if (this.state.zoom === 1) {
        const newZoom = 2.5;
        this.state.translate.x = mx - mx * newZoom;
        this.state.translate.y = my - my * newZoom;
        this.state.zoom = newZoom;
      } else {
        this.resetZoom();
        return;
      }
      this.updateImageTransform();
    });

    this.imageEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = this.imageEl.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;

      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const oldZoom = this.state.zoom;
      const newZoom = Math.min(Math.max(1, oldZoom + delta), 5);

      if (newZoom === oldZoom) return;

      const scale = newZoom / oldZoom;
      const oldTx = this.state.translate.x;
      const oldTy = this.state.translate.y;

      this.state.translate.x = oldTx + mx * (1 - scale);
      this.state.translate.y = oldTy + my * (1 - scale);
      this.state.zoom = newZoom;

      if (newZoom === 1) {
        this.resetZoom();
      } else {
        this.updateImageTransform();
      }
    });

    this.imageEl.addEventListener('mousedown', (e) => {
      if (this.state.zoom > 1) {
        this.state.isDragging = true;
        this.state.start = { x: e.clientX - this.state.translate.x, y: e.clientY - this.state.translate.y };
        this.state.dragStart = { x: e.clientX, y: e.clientY };
        this.state.hasPanned = false;
        this.imageEl.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.state.isDragging && this.state.zoom > 1) {
        e.preventDefault();
        const { dragStart } = this.state;
        if (Math.abs(e.clientX - dragStart.x) > 5 || Math.abs(e.clientY - dragStart.y) > 5) {
          this.state.hasPanned = true;
        }
        this.state.translate.x = e.clientX - this.state.start.x;
        this.state.translate.y = e.clientY - this.state.start.y;
        this.updateImageTransform();
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.state.isDragging) {
        this.state.isDragging = false;
        if (this.state.zoom > 1) {
          this.imageEl.style.cursor = 'grab';
        }
      }
    });

    // Touch
    const getDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    this.imageEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this.state.pinch.initialDistance = getDistance(e.touches);
        this.state.pinch.initialZoom = this.state.zoom;
        this.state.hasPanned = true; // Prevent tap detection when pinching starts
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (this.state.zoom > 1) {
          this.state.isDragging = true;
          this.state.start = { x: touch.clientX - this.state.translate.x, y: touch.clientY - this.state.translate.y };
          e.preventDefault();
        }
        this.state.dragStart = { x: touch.clientX, y: touch.clientY };
        this.state.hasPanned = false;
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const { pinch } = this.state;
        const currentDistance = getDistance(e.touches);
        if (pinch.initialDistance > 0) {
          const rect = this.imageEl.getBoundingClientRect();
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const mx = midX - rect.left - rect.width / 2;
          const my = midY - rect.top - rect.height / 2;

          const oldZoom = this.state.zoom;
          const scaleFromStart = currentDistance / pinch.initialDistance;
          const newZoom = Math.min(Math.max(1, pinch.initialZoom * scaleFromStart), 5);

          if (newZoom === oldZoom) return;

          const scale = newZoom / oldZoom;
          const oldTx = this.state.translate.x;
          const oldTy = this.state.translate.y;

          this.state.translate.x = oldTx + mx * (1 - scale);
          this.state.translate.y = oldTy + my * (1 - scale);
          this.state.zoom = newZoom;

          if (newZoom === 1) {
            this.resetZoom();
          } else {
            this.updateImageTransform();
          }
          this.state.hasPanned = true;
        }
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (this.state.isDragging && this.state.zoom > 1) {
          e.preventDefault();
          if (Math.abs(touch.clientX - this.state.dragStart.x) > 5 || Math.abs(touch.clientY - this.state.dragStart.y) > 5) {
            this.state.hasPanned = true;
          }
          this.state.translate.x = touch.clientX - this.state.start.x;
          this.state.translate.y = touch.clientY - this.state.start.y;
          this.updateImageTransform();
        } else {
          if (Math.abs(touch.clientX - this.state.dragStart.x) > 5 || Math.abs(touch.clientY - this.state.dragStart.y) > 5) {
            this.state.hasPanned = true;
          }
        }
      }
    });

    this.imageEl.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1 && !this.state.hasPanned && this.state.pinch.initialDistance === 0) {
        e.preventDefault();
        const rect = this.imageEl.getBoundingClientRect();
        const touch = e.changedTouches[0];
        const mx = touch.clientX - rect.left - rect.width / 2;
        const my = touch.clientY - rect.top - rect.height / 2;

        if (this.state.zoom === 1) {
            const newZoom = 2.5;
            this.state.translate.x = mx - mx * newZoom;
            this.state.translate.y = my - my * newZoom;
            this.state.zoom = newZoom;
        } else {
            this.resetZoom();
            return;
        }
        this.updateImageTransform();
      }
    });

    document.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) this.state.pinch.initialDistance = 0;
      if (e.touches.length === 0) this.state.isDragging = false;
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  gallery.init();
  lightbox.init();
});
