#!/usr/bin/env bash
# Run once on the Pi:  bash pi/install.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
chmod +x "$DIR/pi/kiosk.sh"

# 1. Web server as a service (starts at boot, restarts if it crashes)
sed -e "s|__USER__|$USER_NAME|g" -e "s|__DIR__|$DIR|g" "$DIR/pi/mirror.service" \
  | sudo tee /etc/systemd/system/mirror.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now mirror.service

# 2. Browser in kiosk mode when the desktop starts
if command -v labwc >/dev/null; then
  F="$HOME/.config/labwc/autostart"           # Raspberry Pi OS Bookworm and newer (Wayland)
  mkdir -p "$(dirname "$F")"
  [ -f "$F" ] || { [ -f /etc/xdg/labwc/autostart ] && cp /etc/xdg/labwc/autostart "$F" || touch "$F"; }
  grep -q "pi/kiosk.sh" "$F" || echo "\"$DIR/pi/kiosk.sh\" &" >> "$F"
else
  F="$HOME/.config/lxsession/LXDE-pi/autostart"   # older X11 desktop
  mkdir -p "$(dirname "$F")"
  [ -f "$F" ] || { [ -f /etc/xdg/lxsession/LXDE-pi/autostart ] && cp /etc/xdg/lxsession/LXDE-pi/autostart "$F" || touch "$F"; }
  grep -q "pi/kiosk.sh" "$F" || echo "@\"$DIR/pi/kiosk.sh\"" >> "$F"
fi

echo "Done. Also set: sudo raspi-config -> System Options -> Boot / Auto Login -> Desktop Autologin"
echo "and Display Options -> Screen Blanking -> No. Then reboot."
