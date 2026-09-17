"""Run with Python + Playwright and installed Google Chrome; no live Sheets writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = Path(__file__).resolve().parents[1] / 'financial_tracker_365.html'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    cloud = []
    posts = []
    mode = {'value': 'ok'}
    held = []
    def api(route):
        request = route.request
        if mode['value'] == 'offline':
            route.abort('internetdisconnected')
            return
        if request.method == 'POST':
            payload = json.loads(request.post_data)
            posts.append(payload)
            if mode['value'] == 'hold':
                held.append(route)
                return
            assert request.headers['content-type'] == 'text/plain;charset=utf-8'
            if mode['value'] == 'reject':
                route.fulfill(json={'ok': False})
                return
            cloud[:] = [e for e in cloud if (e['Date'],e['Category']) != (payload['date'],payload['category'])]
            cloud.append({'Date':payload['date'],'Category':payload['category'],'Actual':payload['actual'],'Planned':payload['planned'],'UpdatedAt':'test'})
            route.fulfill(json={'ok': True})
        else:
            route.fulfill(json={'ok':True,'entries':cloud})
    context.route('https://script.google.com/**', api)
    context.route('http://tracker.test/', lambda route: route.fulfill(path=str(HTML), content_type='text/html'))
    page.goto('http://tracker.test/')
    field = page.locator('#allocation input').first
    field.fill('1234')
    page.wait_for_timeout(1100)
    assert posts and posts[-1]['actual'] == 1234, f'Input must automatically POST after debounce: {errors}'
    assert '1234' in page.evaluate("localStorage.getItem('financeTrackerActual')")
    page.reload()
    page.wait_for_timeout(300)
    assert field.input_value() == '1234', 'Reload must load cloud value'
    field.fill('')
    page.wait_for_timeout(1100)
    assert posts[-1]['actual'] == 0
    page.reload()
    page.wait_for_timeout(300)
    assert field.input_value() == '0', 'Zero must not be replaced by planned amount'
    mode['value'] = 'offline'
    field.fill('777')
    page.wait_for_timeout(1100)
    page.reload()
    page.wait_for_timeout(300)
    assert field.input_value() == '777', 'Offline changes survive reload'
    mode['value'] = 'reject'
    page.locator('#sync').click()
    page.wait_for_timeout(400)
    assert field.input_value() == '777', 'Cloud zero must not overwrite pending edit'
    assert page.locator('#syncStatus').get_attribute('data-status') == 'error'
    mode['value'] = 'ok'
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_timeout(500)
    assert cloud[0]['Actual'] == 777, 'Online event retries pending changes'
    # Editing while the preceding version is in flight must not lose the new value.
    mode['value'] = 'hold'
    before = len(posts)
    field.fill('900')
    page.wait_for_timeout(1000)
    field.fill('901')
    page.wait_for_timeout(1000)
    assert len(posts) == before + 1, 'Same cell must not POST concurrently'
    mode['value'] = 'ok'
    held.pop().fulfill(json={'ok': True})
    page.wait_for_timeout(400)
    assert posts[-1]['actual'] == 901
    assert cloud[0]['Actual'] == 901, 'Stale acknowledgement must retain latest edit'
    before = len(posts)
    field.fill('1')
    field.press('End')
    field.press_sequentially('234', delay=50)
    assert field.input_value() == '1234', 'Recalculation must preserve typing/focus'
    page.wait_for_timeout(1100)
    assert len(posts) == before + 1, 'Keystrokes must be debounced'
    # HTTP errors and non-JSON replies must not acknowledge queued data.
    for bad_response in [{'status':500,'json':{'ok':True}}, {'status':200,'body':'<html>Login</html>'}]:
        context.unroute('https://script.google.com/**', api)
        context.route('https://script.google.com/**', lambda route: route.fulfill(**bad_response))
        field.fill('444')
        page.wait_for_timeout(1100)
        assert page.locator('#syncStatus').get_attribute('data-status') == 'error'
        snapshot = json.loads(page.evaluate("localStorage.getItem('financeTrackerSyncV1')"))
        assert snapshot['pending'], 'Failed responses must remain pending'
        context.unroute('https://script.google.com/**')
    context.route('https://script.google.com/**', api)
    page.locator('#sync').click()
    page.wait_for_timeout(500)
    assert cloud[0]['Actual'] == 444
    # Preserve the existing CSV path, and make reset/import participate in sync.
    with page.expect_download() as download_info:
        page.locator('#export').click()
    csv_data = Path(download_info.value.path()).read_bytes()
    assert '444' in csv_data.decode('utf-8-sig')
    page.on('dialog', lambda dialog: dialog.accept())
    page.locator('#reset').click()
    page.wait_for_timeout(1100)
    assert cloud[0]['Actual'] == 0
    page.locator('#importCsv').set_input_files({'name':'financial-tracker.csv','mimeType':'text/csv','buffer':csv_data})
    page.wait_for_timeout(1600)
    assert field.input_value() == '444'
    assert any(e['Actual'] == 444 for e in cloud)
    assert not errors, errors
    print('PASS: debounce, POST, GET, reload, empty/zero, offline durability, merge protection, rejection, retry, in-flight edits, typing, HTTP/JSON errors, CSV and reset; no JS errors')
    browser.close()
