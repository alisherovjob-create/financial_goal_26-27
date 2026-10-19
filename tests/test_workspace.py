"""Task navigation tests; all cloud requests use in-memory fixtures."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.clock.install(time='2026-10-14T12:00:00Z')
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('http://tracker.test/**',lambda r:r.fulfill(path=str(ROOT/(r.request.url.split('/')[-1].split('#')[0] or 'index.html'))))
    page.route('https://script.google.com/**',lambda r:r.fulfill(json={'ok':True,'expenses':[]} if 'action=expenses' in r.request.url else {'ok':True,'entries':[]}))
    page.goto('http://tracker.test/')
    assert page.locator('#overviewView').is_visible()
    assert not page.locator('#allocation').is_visible()
    assert not page.locator('#startDate').is_visible()
    assert page.locator('#startTrajectory').is_visible()
    assert page.locator('#overviewGoals [data-focus-goal]').count()==11, 'Overview includes every goal'
    page.locator('#openNextPayment').click()
    assert page.locator('#allocation').is_visible()
    assert page.url.endswith('#payments')
    field=page.locator('#allocation input').first
    field.fill('12345')
    page.locator('[data-view=overview]').click()
    page.wait_for_timeout(100)
    assert '12' in page.locator('.trajectory-total').inner_text()
    assert page.locator('[data-contribution-date]').count()==24, 'One discrete item per payment'
    assert '12' in page.locator('[data-contribution-date]').filter(has=page.locator('.contribution-actual-label')).first.inner_text()
    payment_date=page.locator('[data-contribution-date]').first.get_attribute('data-contribution-date')
    page.locator('[data-contribution-date]').first.click()
    assert page.evaluate('selectedDate')==payment_date, 'Contribution opens its payment'
    assert field.input_value()=='12345','Navigation preserves edited savings'
    page.locator('[data-view=goals]').click()
    assert page.locator('#goals .goal:visible').count()==11
    page.locator('[data-view=expenses]').click()
    page.wait_for_timeout(150)
    page.locator('#expenseSearch').fill('путешествия')
    assert page.locator('.expense-card:visible').count()==1
    page.locator('#expenseSearch').fill('неизвестная статья')
    assert page.locator('.search-empty').is_visible()
    page.locator('#expenseSearch').fill('')
    card=page.locator('.expense-card').first
    card.locator('summary').click()
    card.locator('[name=amount]').fill('42')
    card.locator('[name=comment]').fill('Черновик')
    page.locator('[data-view=goals]').click()
    page.locator('[data-view=expenses]').click()
    page.wait_for_timeout(150)
    assert card.locator('[name=comment]').input_value()=='Черновик','Navigation preserves expense draft'
    page.go_back()
    assert page.locator('#goals').is_visible(),'Back restores previous screen'
    page.go_forward()
    assert page.locator('#expenseSearch').is_visible()
    page.reload()
    assert page.locator('#expensesPanel').is_visible(),'Reload preserves selected screen'
    page.locator('[data-view=payments]').click()
    page.locator('#allocation input').first.fill('0')
    page.locator('[data-view=overview]').click()
    page.wait_for_timeout(100)
    assert page.locator('[data-contribution-date]').count()==24, 'Confirmed zero still shows payment history'
    assert page.locator('.contribution-actual-label').first.inner_text()=='0 ₽'.replace(' ', '\u00a0'), 'Zero differs from unconfirmed payment'
    for width in [1440,1024,768,390,320]:
        page.set_viewport_size({'width':width,'height':844})
        for view in ['overview','goals','payments','expenses','settings']:
            page.locator(f'[data-view={view}]').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow: {view} at {width}px'
    assert not errors,errors
    browser.close()
print('PASS: task views, contextual actions, chart updates, drafts, expense search, back/forward, reload and responsive layout')
