document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const button = form.querySelector('button[type="submit"]');
  const language = document.documentElement.lang === 'bn' ? 'bn' : 'en';

  const messages = {
    en: { sending: 'Sending…', success: 'Message sent successfully. We will get back to you soon.', error: 'We could not send your message. Please try again later.', invalid: 'Please check your details and try again.' },
    bn: { sending: 'পাঠানো হচ্ছে…', success: 'মেসেজ সফলভাবে পাঠানো হয়েছে। আমরা শিগগিরই আপনার সাথে যোগাযোগ করব।', error: 'মেসেজ পাঠানো যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।', invalid: 'আপনার তথ্যগুলো পরীক্ষা করে আবার চেষ্টা করুন।' }
  };

  const copy = messages[language];

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.language = language;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = copy.sending;
    status.className = 'form-status is-loading';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        status.textContent = result.error || (response.status === 400 ? copy.invalid : copy.error);
        status.className = 'form-status is-error';
        if (result.field) {
          const badField = form.querySelector(`[name="${result.field}"]`);
          if (badField) {
            badField.focus();
            badField.setCustomValidity(result.error || '');
            badField.reportValidity();
            badField.addEventListener('input', () => badField.setCustomValidity(''), { once: true });
          }
        }
        return;
      }

      status.textContent = copy.success;
      status.className = 'form-status is-success';
      form.reset();
      const languageField = form.querySelector('input[name="language"]');
      if (languageField) languageField.value = language;
    } catch (error) {
      status.textContent = copy.error;
      status.className = 'form-status is-error';
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
});
