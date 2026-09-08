document.addEventListener('DOMContentLoaded', function () {
  var qrEl = document.getElementById('qr-code');
  if (qrEl && window.QRCode) {
    new QRCode(qrEl, {
      text: 'https://play.google.com/store/apps/details?id=com.satulink.mysheba',
      width: 160,
      height: 160,
      colorDark: '#000000',
      colorLight: '#ffffff'
    });
  }
});
