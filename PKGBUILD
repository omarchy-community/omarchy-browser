# Maintainer: Omarchy Development Labs <omarchystore@gmail.com>
pkgname=omarchy-browser
pkgver=1.0.0
pkgrel=1
pkgdesc="Chromium-based web browser with the Omarchy Store built in"
arch=('any')
url="https://github.com/omarchy-community/omarchy-browser"
license=('MIT')
depends=('electron43')

package() {
  install -d "$pkgdir/usr/share/omarchy-browser/app/icons"
  cp -r "$startdir"/app/*.{js,json,html,css} "$pkgdir/usr/share/omarchy-browser/app/"
  cp -r "$startdir"/app/icons/*.png "$pkgdir/usr/share/omarchy-browser/app/icons/"

  install -Dm755 /dev/stdin "$pkgdir/usr/bin/omarchy-browser" <<'EOF'
#!/bin/bash
exec electron43 /usr/share/omarchy-browser/app "$@"
EOF

  install -Dm644 /dev/stdin "$pkgdir/usr/share/applications/omarchy-browser.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Omarchy Browser
GenericName=Web Browser
Comment=Browse the web with the Omarchy Store built in
Exec=omarchy-browser %U
Icon=omarchy-browser
Terminal=false
Categories=Network;WebBrowser;
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
Keywords=browser;web;internet;store;omarchy;
StartupNotify=true
StartupWMClass=omarchy-browser
EOF

  for s in 16 24 32 48 64 128 256 512; do
    install -Dm644 "$startdir/app/icons/${s}x${s}.png" "$pkgdir/usr/share/icons/hicolor/${s}x${s}/apps/omarchy-browser.png"
  done
}
