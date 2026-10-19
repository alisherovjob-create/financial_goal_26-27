import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    expenses=[]
    mode={'fail':False}
    posts=[]
    def api(route):
        req=route.request
        if req.method=='POST':
            body=json.loads(req.post_data)
            if body.get('action')=='addExpense':
                posts.append(body)
                if mode['fail']:
                    route.fulfill(json={'ok':False,'error':'Ошибка записи'})
                    return
                entry={'Id':body['id'],'Category':body['category'],'Amount':body['amount'],'Comment':body['comment'],'CreatedAt':'2026-10-14T10:00:00Z'}
                if not any(e['Id']==entry['Id'] for e in expenses):expenses.append(entry)
                route.fulfill(json={'ok':True,'expense':entry})
            else: route.fulfill(json={'ok':True})
        elif 'action=expenses' in req.url:route.fulfill(json={'ok':True,'expenses':expenses})
        else:route.fulfill(json={'ok':True,'entries':[{'Date':'2026-10-23','Category':'Быт','Actual':50000,'Planned':34300,'UpdatedAt':'2026-10-14T10:00:00Z'}]})
    page.route('https://script.google.com/**',api)
    page.route('http://tracker.test/**',lambda r:r.fulfill(path=str(ROOT/('index.html' if r.request.url.endswith('/') else r.request.url.split('/')[-1]))))
    page.goto('http://tracker.test/')
    page.locator('[data-view=expenses]').click()
    page.wait_for_timeout(300)
    card=page.locator('.expense-card').first
    assert page.locator('.expense-card').count()==11
    assert not card.evaluate('(el)=>el.open'), 'Cards start collapsed'
    card.locator('summary').click()
    form=card.locator('form')
    form.locator('[name=amount]').fill('7000')
    form.locator('[name=comment]').fill('<b>Покупка</b>')
    form.locator('button').click()
    page.wait_for_timeout(300)
    assert '43' in card.locator('[data-balance]').inner_text(), (card.inner_text(),posts,errors)
    assert page.evaluate("totalActual('Быт')")==50000
    assert card.locator('[data-balance]').evaluate('(el)=>getComputedStyle(el).color')=='rgb(22, 128, 74)'
    assert card.locator('.expense-history').inner_text().find('<b>Покупка</b>')>=0
    assert form.locator('[name=amount]').input_value()==''
    form.locator('[name=amount]').fill('44000')
    form.locator('[name=comment]').fill('Сверх остатка')
    form.locator('button').click()
    page.wait_for_timeout(300)
    assert len(posts)==2, 'Expense above balance must be saved'
    assert card.locator('[data-balance]').inner_text().replace('−','-').startswith('-1'), 'Balance must be negative'
    assert card.locator('[data-balance]').get_attribute('class')=='bad'
    assert card.locator('[data-balance]').evaluate('(el)=>getComputedStyle(el).color')=='rgb(194, 59, 54)'
    assert page.evaluate("totalActual('Быт')")==50000
    mode['fail']=True
    form.locator('[name=comment]').fill('Расход при отрицательном остатке')
    form.locator('[name=amount]').fill('1000')
    form.locator('button').click()
    page.wait_for_timeout(300)
    assert form.locator('[name=amount]').input_value()=='1000'
    mode['fail']=False
    form.locator('button').click()
    page.wait_for_timeout(300)
    assert posts[-1]['id']==posts[-2]['id']
    page.reload()
    page.locator('[data-view=expenses]').click()
    page.wait_for_timeout(300)
    assert page.locator('.expense-card').first.locator('.expense-history li').count()==3
    page.set_viewport_size({'width':375,'height':812})
    card.locator('summary').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    browser.close()
print('PASS: expenses, balance isolation, validation, retries, reload, escaping, mobile')
