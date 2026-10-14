from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page()
    code=(root/'apps-script/Sync.gs').read_text()+'\n'+(root/'tests/expenses_server_harness.js').read_text()
    print(page.evaluate('() => { '+code+' }'))
    browser.close()
