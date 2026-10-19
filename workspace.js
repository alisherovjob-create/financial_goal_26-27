// Presentation and navigation only. Reuses the existing savings and expense controllers.
(() => {
  const content=document.querySelector('.wrap');
  const savings=document.getElementById('savingsPanel');
  const expensesPanel=document.getElementById('expensesPanel');
  const legacyTabs=document.querySelector('.finance-tabs');
  legacyTabs.hidden=true;
  const shell=document.createElement('div');shell.className='workspace-shell';
  content.before(shell);
  const sidebar=document.createElement('aside');sidebar.className='workspace-sidebar';
  const icons={overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',goals:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',payments:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-12 5h6"/>',expenses:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'};
  const views={overview:['Обзор','Всё важное — перед вами','Накопления, движение к целям и следующая выплата.'],goals:['Цели','У каждого плана есть свой путь','Все направления накоплений и их фактический прогресс.'],payments:['Выплаты','Одна выплата. Чёткий план.','Выберите дату слева и подтвердите суммы по направлениям.'],expenses:['Расходы','На что идут ваши деньги','Выберите статью, чтобы добавить расход или посмотреть историю.'],settings:['Настройки','Ваши правила','Период, работа с файлами и управление данными.']};
  sidebar.innerHTML='<p class="workspace-label">Личные финансы</p><nav aria-label="Основная навигация">'+Object.entries(views).map(([id,[label]])=>`<button type="button" data-view="${id}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${label}</span><span class="nav-arrow" aria-hidden="true">↗</span></button>`).join('')+'</nav><div class="workspace-period"><span>Ваша финансовая дистанция</span><strong>365 дней</strong><small id="workspacePeriod"></small></div><p class="workspace-sidebar-note">Маленькие шаги.<br>Большие возможности.</p>';
  shell.append(sidebar,content);content.classList.add('workspace-content');
  const header=document.createElement('header');header.className='workspace-header';
  header.innerHTML='<div><p class="workspace-eyebrow" id="workspaceSection"></p><h1 id="workspaceTitle" tabindex="-1"></h1><p id="workspaceDescription"></p></div><div class="workspace-actions"></div>';
  content.prepend(header);
  header.querySelector('.workspace-actions').append(document.getElementById('sync').parentElement);
  const section=(id)=>{const el=document.createElement('section');el.id=id+'View';el.className='workspace-view';savings.append(el);return el;};
  const overview=section('overview'),goalsView=section('goals'),paymentsView=section('payments'),settingsView=section('settings');
  goalsView.append(document.getElementById('goals').closest('section'));
  paymentsView.append(document.getElementById('allocation').closest('section'));
  const rules=document.getElementById('summary').closest('section');
  const settingsControls=document.querySelector('.hero>.controls');
  settingsControls.classList.add('workspace-settings-controls');
  settingsView.append(settingsControls,rules);
  const note=savings.querySelector(':scope > p.note');if(note)settingsView.append(note);
  savings.querySelector('.hero').remove();
  overview.append(document.getElementById('metrics'),document.getElementById('runRate'));
  const dashboard=document.createElement('div');dashboard.className='overview-grid';
  dashboard.innerHTML='<section class="trajectory"><div class="section-heading"><div><p class="workspace-eyebrow">Шаг за шагом</p><h2>Накопления по выплатам</h2></div><span>За выбранный период</span></div><div id="savingsTrajectory"></div></section><section class="next-step"><p class="workspace-eyebrow">Следующее действие</p><h2 id="nextPaymentTitle"></h2><p id="nextPaymentCopy"></p><div id="nextPaymentAmount"></div><button type="button" id="openNextPayment">Распределить выплату <span aria-hidden="true">↗</span></button></section><section class="overview-goals"><div class="section-heading"><div><p class="workspace-eyebrow" id="overviewGoalsCount">Все направления</p><h2>Ваши цели</h2></div><button type="button" class="text-action" id="openAllGoals">Подробный прогресс ↗</button></div><div id="overviewGoals"></div></section></div>';
  overview.append(dashboard);
  // Existing expense title is replaced by the common contextual page heading.
  expensesPanel.querySelector('h1').hidden=true;
  expensesPanel.querySelector(':scope > p').hidden=true;
  const search=document.createElement('div');search.className='expense-search';
  search.innerHTML='<label for="expenseSearch">Найти статью</label><input id="expenseSearch" type="search" placeholder="Например, путешествия" autocomplete="off"><span id="expenseSearchCount" role="status"></span>';
  expensesPanel.querySelector('#expenseCards').before(search);
  const empty=document.createElement('p');empty.className='search-empty';empty.textContent='Статьи не найдены. Попробуйте другое название.';empty.hidden=true;search.after(empty);
  const cards=Array.from(expensesPanel.querySelectorAll('.expense-card'));
  function filterExpenses(){const query=search.querySelector('input').value.trim().toLocaleLowerCase('ru');let count=0;cards.forEach((card,i)=>{card.hidden=!PLAN[i][0].toLocaleLowerCase('ru').includes(query);if(!card.hidden)count++;});search.querySelector('span').textContent=`${count} из ${cards.length} статей`;empty.hidden=count!==0;}
  search.querySelector('input').addEventListener('input',filterExpenses);filterExpenses();
  cards.forEach(card=>card.addEventListener('toggle',()=>{if(card.open)cards.forEach(other=>{if(other!==card)other.open=false;});}));
  let currentView=null,nextDate=null;
  function navigate(view,push=true){
    if(!views[view])view='overview';
    if(push && location.hash!=='#'+view)history.pushState(null,'','#'+view);
    const changed=currentView!==view;currentView=view;
    sidebar.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    document.getElementById(view==='expenses'?'expensesTab':'savingsTab').click();
    for(const [id,el] of Object.entries({overview,goals:goalsView,payments:paymentsView,settings:settingsView}))el.hidden=id!==view;
    header.querySelector('.workspace-actions').hidden=view==='expenses';
    document.getElementById('workspaceSection').textContent=views[view][0];
    document.getElementById('workspaceTitle').textContent=views[view][1];
    document.getElementById('workspaceDescription').textContent=views[view][2];
    if(changed && push){document.getElementById('workspaceTitle').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  }
  sidebar.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
  window.addEventListener('popstate',()=>navigate(location.hash.slice(1),false));
  window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==currentView)navigate(location.hash.slice(1),false);});
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function updateOverview(){
    const totals=PLAN.map(([name])=>({name,total:totalActual(name),planned:totalPlannedFor(name)}));
    const total=totals.reduce((sum,g)=>sum+g.total,0);
    const payments=rows.map(row=>({row,amount:PLAN.reduce((sum,[g])=>sum+(+actual[key(row.date,g)]||0),0),planned:plannedForPayment(row),confirmed:PLAN.some(([g])=>Object.hasOwn(actual,key(row.date,g)))}));
    const max=Math.max(1,...payments.flatMap(p=>[p.amount,p.planned])),chart=document.getElementById('savingsTrajectory');
    const previousScroll=chart.querySelector('.contribution-list')?.scrollTop||0;
    if(payments.some(p=>p.confirmed)){
      chart.innerHTML=`<div class="trajectory-total">${euro(total)}<small>фактически накоплено за период</small></div><div class="contribution-legend"><span><i class="legend-actual"></i>Факт</span><span><i class="legend-plan"></i>План</span><small>Нажмите на выплату, чтобы открыть её</small></div><div class="contribution-list" tabindex="0" role="region" aria-label="Накопления по датам выплат">${payments.map(p=>{
        const date=dateRu(p.row.date),future=p.row.date>iso(new Date());
        return `<button type="button" class="contribution-row ${p.confirmed?'confirmed':'unconfirmed'} ${future?'future':''}" data-contribution-date="${p.row.date}" aria-label="${date}: ${p.confirmed?'отложено '+esc(euro(p.amount)):'сумма не внесена'}, план ${esc(euro(p.planned))}"><span class="contribution-date">${date.slice(0,5)}<small>${date.slice(6)}</small></span><span class="contribution-bars"><span class="contribution-plan" style="width:${p.planned/max*100}%"></span><span class="contribution-actual" style="width:${p.amount/max*100}%"></span></span><span class="contribution-amount"><strong class="contribution-actual-label">${p.confirmed?euro(p.amount):'Не внесено'}</strong><small>план ${euro(p.planned)}</small></span><span class="contribution-arrow" aria-hidden="true">↗</span></button>`;
      }).join('')}</div>`;
      chart.querySelector('.contribution-list').scrollTop=previousScroll;
      chart.querySelectorAll('[data-contribution-date]').forEach(button=>button.onclick=()=>{selectedDate=button.dataset.contributionDate;render();navigate('payments');});
    }else chart.innerHTML='<div class="trajectory-empty"><span aria-hidden="true">↗</span><h3>История начинается с первой суммы</h3><p>Подтвердите накопления в разделе «Выплаты», чтобы сравнивать фактические суммы с планом по каждой дате.</p><button type="button" class="text-action" id="startTrajectory">Перейти к выплатам ↗</button></div>';
    document.getElementById('startTrajectory')?.addEventListener('click',()=>navigate('payments'));
    const today=iso(new Date()),next=rows.find(row=>row.date>=today)||rows.find(row=>!closed[row.date] && PLAN.reduce((sum,[g])=>sum+(+actual[key(row.date,g)]||0),0)<plannedForPayment(row));
    nextDate=next?.date||null;
    document.getElementById('nextPaymentTitle').textContent=next?dateRu(next.date):'Нет выплат в периоде';
    document.getElementById('nextPaymentCopy').textContent=next?'Выберите, сколько отложить по каждому направлению. План уже подготовлен.':'Измените начало периода в настройках.';
    document.getElementById('nextPaymentAmount').innerHTML=next?`<span>План распределения</span><strong>${euro(plannedForPayment(next))}</strong>`:'';
    document.getElementById('openNextPayment').textContent=next?'Открыть распределение ↗':'Открыть настройки ↗';
    document.getElementById('overviewGoalsCount').textContent=`${totals.length} направлений · ${totals.filter(g=>g.planned>0 && g.total>=g.planned).length} достигнуто`;
    document.getElementById('overviewGoals').innerHTML=totals.map(g=>{const pct=g.planned?Math.min(100,g.total/g.planned*100):0;return `<button type="button" class="focus-goal" data-focus-goal="${esc(g.name)}"><span class="focus-name">${esc(g.name)}</span><strong class="focus-value">${euro(g.total)}</strong><small>из ${euro(g.planned)}</small><span class="focus-progress"><span style="width:${pct}%"></span></span><span class="focus-footer"><b>${Math.round(pct)}%</b><span>${g.planned && g.total>=g.planned?'Цель достигнута':'Посмотреть цель'} <span aria-hidden="true">↗</span></span></span></button>`;}).join('');
    document.querySelectorAll('[data-focus-goal]').forEach(button=>button.onclick=()=>{navigate('goals');const index=PLAN.findIndex(([g])=>g===button.dataset.focusGoal);document.querySelectorAll('#goals .goal')[index]?.scrollIntoView({block:'center',behavior:'smooth'});});
    document.getElementById('workspacePeriod').textContent=`${dateRu(iso(getStart()))} — ${dateRu(iso(addDays(getStart(),DAYS-1)))}`;
  }
  document.getElementById('openNextPayment').onclick=()=>{if(nextDate){selectedDate=nextDate;render();navigate('payments');}else navigate('settings');};
  document.getElementById('openAllGoals').onclick=()=>navigate('goals');
  new MutationObserver(updateOverview).observe(document.getElementById('goals'),{childList:true});
  updateOverview();
  navigate(location.hash.slice(1),false);
})();
