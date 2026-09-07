/* ============================================
   MySheba Website — Global Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Menu Toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', function() {
      this.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    // Close mobile menu on link click
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    if (question && answer) {
      question.addEventListener('click', () => {
        const isActive = question.classList.contains('active');

        // Close all others
        document.querySelectorAll('.faq-question.active').forEach(q => {
          if (q !== question) {
            q.classList.remove('active');
            q.nextElementSibling.style.maxHeight = null;
          }
        });

        // Toggle current
        question.classList.toggle('active');
        if (!isActive) {
          answer.style.maxHeight = answer.scrollHeight + 'px';
        } else {
          answer.style.maxHeight = null;
        }
      });
    }
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Hero phone mockup — auto-rotating screenshot slider
  const phoneSlider = document.getElementById('phone-slider');
  if (phoneSlider) {
    const slides = phoneSlider.querySelectorAll('.phone-slide');
    const dots = phoneSlider.querySelectorAll('.dot');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (slides.length > 1 && !reduceMotion) {
      let current = 0;
      setInterval(() => {
        slides[current].classList.remove('active');
        if (dots[current]) dots[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
        if (dots[current]) dots[current].classList.add('active');
      }, 3200);
    }
  }

  // Motion capability flags — gate cursor-driven effects to devices that can use them
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Steps connector line — fills in as each step is revealed
  const stepsProgress = new Map();
  document.querySelectorAll('.steps').forEach(el => {
    stepsProgress.set(el, { total: el.querySelectorAll('.step').length, done: 0 });
  });

  // Scroll-triggered reveal animations (cards, list items, badges, etc.)
  const revealTargets = document.querySelectorAll(
    '.service-card, .feature-item, .step, .blog-card, .faq-item, .section-header, ' +
    '.contact-info, .contact-form, .download-info, .download-grid > *, .app-cta, ' +
    '.country-badge, .operator-badge, .wallet-badge'
  );
  if ('IntersectionObserver' in window && revealTargets.length) {
    const staggerCounts = new Map();
    revealTargets.forEach(el => {
      el.classList.add('reveal');
      const parent = el.parentElement;
      const idx = staggerCounts.get(parent) || 0;
      el.style.setProperty('--d', Math.min(idx * 0.08, 0.48) + 's');
      staggerCounts.set(parent, idx + 1);
    });

    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);

          if (entry.target.classList.contains('step')) {
            const stepsEl = entry.target.closest('.steps');
            const data = stepsEl && stepsProgress.get(stepsEl);
            if (data) {
              data.done += 1;
              const pct = data.total > 1 ? ((data.done - 1) / (data.total - 1)) * 100 : 100;
              stepsEl.style.setProperty('--progress', Math.max(pct, 0) + '%');
            }
          }
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach(el => revealObserver.observe(el));
  }

  // Cursor-follow spotlight glow + subtle 3D tilt on cards (pointer-fine devices, motion allowed)
  if (canHover && !prefersReducedMotion) {
    document.querySelectorAll('.service-card, .blog-card, .feature-item').forEach(card => {
      card.addEventListener('pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        card.style.setProperty('--sx', px * 100 + '%');
        card.style.setProperty('--sy', py * 100 + '%');
        const tiltMax = 5; // degrees — kept subtle for a premium, not gimmicky, feel
        const rotY = (px - 0.5) * tiltMax * 2;
        const rotX = (0.5 - py) * tiltMax * 2;
        card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px)`;
      });
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
      });
    });

    // Magnetic pull on primary buttons — nudges toward the cursor within a small radius
    document.querySelectorAll('.btn-primary, .btn-outline, .store-btn').forEach(btn => {
      const strength = 0.28;
      const maxPull = 8;
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        const mx = (e.clientX - rect.left - rect.width / 2) * strength;
        const my = (e.clientY - rect.top - rect.height / 2) * strength;
        btn.style.setProperty('--mx', Math.max(-maxPull, Math.min(maxPull, mx)) + 'px');
        btn.style.setProperty('--my', Math.max(-maxPull, Math.min(maxPull, my)) + 'px');
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  // Auto-scrolling logo/badge marquee — only for rows with enough items to loop nicely
  document.querySelectorAll('.operators-grid, .operators-row').forEach(row => {
    const items = Array.from(row.children);
    if (items.length < 8 || row.closest('.marquee-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'marquee-wrap';
    const track = document.createElement('div');
    track.className = 'marquee-track';
    track.style.setProperty('--marquee-duration', Math.max(items.length * 2.2, 20) + 's');
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(track);
    // Move the original items straight into the track (not nested inside `row`)
    // so both halves of the loop are flat, identically-spaced flex children.
    items.forEach(item => track.appendChild(item));
    // Duplicate the set once for a seamless loop — strip reveal-on-scroll state
    // since these clones sit off the initial viewport and would otherwise stay hidden
    items.forEach(item => {
      const clone = item.cloneNode(true);
      clone.classList.remove('reveal', 'in-view');
      clone.style.removeProperty('--d');
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
    row.remove();
  });

  // Scroll progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'scroll-progress';
  document.body.appendChild(progressBar);

  // Back-to-top button
  const backToTop = document.createElement('button');
  backToTop.className = 'back-to-top';
  backToTop.type = 'button';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.textContent = '↑';
  document.body.appendChild(backToTop);
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Combined scroll effects: header shadow/hide, progress bar, back-to-top visibility
  const header = document.querySelector('.site-header');
  const headerHeight = header ? header.offsetHeight : 0;
  const heroVisual = document.querySelector('.hero-visual');
  // Release the entrance animation's grip on `transform` once it finishes,
  // so the scroll-driven parallax below can take over the same property.
  if (heroVisual) {
    heroVisual.addEventListener('animationend', () => { heroVisual.style.animation = 'none'; }, { once: true });
  }
  let lastScrollY = window.scrollY;
  let ticking = false;

  function onScrollUpdate() {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (docHeight > 0 ? (scrollY / docHeight) * 100 : 0) + '%';

    if (header) {
      header.style.boxShadow = scrollY > 10 ? '0 2px 10px rgba(0,0,0,0.08)' : 'none';
      header.classList.toggle('is-scrolled', scrollY > 10);
      const menuOpen = mobileNav && mobileNav.classList.contains('active');
      if (!menuOpen && scrollY > lastScrollY && scrollY > headerHeight + 40) {
        header.classList.add('header-hidden');
      } else {
        header.classList.remove('header-hidden');
      }
    }

    // Gentle parallax drift on the hero visual (desktop, motion allowed)
    if (heroVisual && canHover && !prefersReducedMotion) {
      const shift = Math.min(scrollY * 0.08, 40);
      heroVisual.style.transform = `translateY(${shift}px)`;
    }

    backToTop.classList.toggle('visible', scrollY > 400);
    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(onScrollUpdate);
      ticking = true;
    }
  });
  onScrollUpdate();

  // Ripple effect on buttons
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      this.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });

  // Lazy load images (simple)
  if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          img.removeAttribute('loading');
          imageObserver.unobserve(img);
        }
      });
    });
    lazyImages.forEach(img => imageObserver.observe(img));
  }

  // Analytics event tracking (placeholder)
  document.querySelectorAll('[data-track]').forEach(el => {
    el.addEventListener('click', function() {
      const event = this.dataset.track;
      const category = this.dataset.category || 'engagement';
      const label = this.dataset.label || '';

      // Google Analytics 4 event
      if (typeof gtag !== 'undefined') {
        gtag('event', event, {
          event_category: category,
          event_label: label
        });
      }

      // Console log for debugging
      console.log('Track:', { event, category, label });
    });
  });

  // Cross-page fade transition — gives the multi-page site an app-like feel
  if (!prefersReducedMotion) {
    document.body.classList.add('is-loaded');
    const veil = document.createElement('div');
    veil.className = 'page-veil';
    document.body.appendChild(veil);

    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') ||
          href.startsWith('intent://') || href.startsWith('mysheba://') ||
          link.target === '_blank' || link.hasAttribute('download')) return;
      let url;
      try { url = new URL(href, window.location.href); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      link.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        veil.classList.add('is-active');
        setTimeout(() => { window.location.href = url.href; }, 220);
      });
    });
  }

  // App deep link handling
  document.querySelectorAll('a[href^="intent://"], a[href^="mysheba://"]').forEach(link => {
    link.addEventListener('click', function(e) {
      // If on mobile, try to open app; fallback to download page
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobile) {
        e.preventDefault();
        window.location.href = '/download/';
      }
    });
  });
});

