// Expenses only read the savings model; their storage and API are independent.
(() => {
  const CACHE='financeTrackerExpensesV1';
  let expenses=[], attempts={}, ready=false, loadingExpenses=null;
  try { const cached=JSON.parse(localStorage.getItem(CACHE)||'{}'); expenses=cached.expenses||[]; attempts=cached.attempts||{}; } catch (_) {}
  const persist=()=>localStorage.setItem(CACHE,JSON.stringify({expenses,attempts}));
  const main=document.createElement('div'); main.id='savingsPanel';
  const wrap=document.querySelector('.wrap');
  while(wrap.firstChild) main.append(wrap.firstChild);
  const tabs=document.createElement('nav'); tabs.className='controls finance-tabs'; tabs.setAttribute('aria-label','Разделы трекера');
  tabs.innerHTML='<button id="savingsTab" aria-pressed="true">Накопления</button><button id="expensesTab" class="secondary" aria-pressed="false">Расходы по статьям</button>';
  const panel=document.createElement('section'); panel.id='expensesPanel'; panel.hidden=true;
  panel.innerHTML='<h1>Расходы по статьям</h1><p>Остатки учитывают расходы отдельно от накоплений. История сохраняется в Google Таблице.</p><div class="controls"><button class="secondary" id="expenseSync">Синхронизировать расходы</button><span id="expenseSyncStatus" role="status" aria-live="polite"></span></div><div id="expenseCards"></div>';
  wrap.append(tabs,main,panel);
  const status=panel.querySelector('#expenseSyncStatus');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const spent=category=>expenses.filter(e=>e.Category===category).reduce((sum,e)=>sum+e.Amount,0);
  function refresh(){
    panel.querySelectorAll('.expense-card').forEach((card,i)=>{
      const category=PLAN[i][0], total=totalActual(category), used=spent(category);
      card.querySelector('[data-total]').textContent=euro(total);
      card.querySelector('[data-spent]').textContent=euro(used);
      const balance=card.querySelector('[data-balance]'); balance.textContent=euro(total-used); balance.className=total<used?'bad':'good';
      const history=expenses.filter(e=>e.Category===category).sort((a,b)=>Date.parse(b.CreatedAt)-Date.parse(a.CreatedAt));
      card.querySelector('.expense-history').innerHTML=history.length?'<ul>'+history.map(e=>`<li><time>${escape(new Date(e.CreatedAt).toLocaleString('ru-RU',{timeZone:SHEET_TIME_ZONE}))}</time><strong>${euro(e.Amount)}</strong><span>${escape(e.Comment)}</span></li>`).join('')+'</ul>':'<p>По этой статье пока нет расходов</p>';
    });
  }
  function merge(entry){ expenses=expenses.filter(e=>e.Id!==entry.Id); expenses.push(entry); }
  async function api(options={}){
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(APPS_SCRIPT_URL+'?action=expenses',{...options,signal:controller.signal,cache:'no-store',redirect:'follow'});
      if(!response.ok) throw new Error('Google Таблица недоступна');
      const data=await response.json();
      if(data.ok!==true){const error=new Error(data.error||'Таблица не подтвердила сохранение');error.code=data.code;throw error;}
      return data;
    } finally {clearTimeout(timer)}
  }
  function sync(){
    if(loadingExpenses) return loadingExpenses;
    status.textContent='Загрузка расходов…';
    loadingExpenses=(async()=>{
      try{
        const data=await api();
        if(!Array.isArray(data.expenses)) throw new Error('Обновите развёртывание Apps Script для поддержки расходов');
        expenses=data.expenses;
        Object.keys(attempts).forEach(category=>{if(expenses.some(e=>e.Id===attempts[category].id)){delete attempts[category];const form=panel.querySelectorAll('form')[PLAN.findIndex(([g])=>g===category)];form?.reset();}});
        ready=true; refresh();
        try{persist()}catch(_){status.textContent='Загружено из таблицы; локальный кэш недоступен';return}
        status.textContent='Синхронизировано ✓';
      }catch(error){ready=false;status.textContent='Не удалось загрузить расходы: '+error.message;}
      finally{loadingExpenses=null}
    })(); return loadingExpenses;
  }
  PLAN.forEach(([category])=>{
    const card=document.createElement('article');card.className='panel expense-card';
    card.innerHTML=`<h2>${escape(category)}</h2><div class="expense-totals"><div>Всего накоплено<strong data-total></strong></div><div>Всего потрачено<strong data-spent></strong></div><div>Доступный остаток<strong data-balance></strong></div></div><form><label>Сумма расхода<input name="amount" type="number" min="1" step="1" required></label><label>Цель расхода / комментарий<input name="comment" type="text" required maxlength="2000"></label><button>Добавить расход</button><p role="status" aria-live="polite"></p></form><h3>История расходов</h3><div class="expense-history"></div>`;
    const form=card.querySelector('form'), message=form.querySelector('[role=status]'), button=form.querySelector('button');
    if(attempts[category]){form.elements.amount.value=attempts[category].amount;form.elements.comment.value=attempts[category].comment;}
    let busy=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const amount=Number(form.elements.amount.value),comment=form.elements.comment.value.trim();
      if(!Number.isSafeInteger(amount)||amount<=0||!comment){message.textContent='Введите сумму в целых рублях больше нуля и комментарий';return;}
      const prior=attempts[category];
      if(prior && (prior.amount!==amount||prior.comment!==comment)){message.textContent='Сначала повторите сохранение предыдущего расхода с исходными значениями: '+euro(prior.amount)+' — '+prior.comment;return;}
      if(!prior && amount>totalActual(category)-spent(category)){message.textContent='Сумма расхода превышает доступный остаток';return;}
      if(!ready){message.textContent='Сначала синхронизируйте расходы с Google Таблицей';return;}
      if(Object.keys(pending).length){message.textContent='Дождитесь сохранения накоплений на основной вкладке';return;}
      busy=true;button.disabled=true;message.textContent='Сохраняется…';
      try{
        const entry=prior||{id:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),category,amount,comment,dates:rows.map(r=>r.date)};
        attempts[category]=entry;persist();
        const data=await api({method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'addExpense',...entry})});
        if(!data.expense||data.expense.Id!==entry.id)throw new Error('Обновите развёртывание Apps Script: расход не подтверждён');
        merge(data.expense);delete attempts[category];form.reset();refresh();
        message.textContent='Расход сохранён ✓';
        try{persist()}catch(_){message.textContent='Расход сохранён в таблице; локальный кэш недоступен';}
      }catch(error){
        if(error.code==='INSUFFICIENT_BALANCE'){delete attempts[category];try{persist()}catch(_){};sync();}
        message.textContent='Не удалось сохранить расход: '+error.message+'. Повторите отправку.';
      }
      finally{busy=false;button.disabled=false;}
    });
    panel.querySelector('#expenseCards').append(card);
  });
  function select(showExpenses){main.hidden=showExpenses;panel.hidden=!showExpenses;tabs.querySelectorAll('button').forEach((b,i)=>{const selected=Boolean(i)===showExpenses;b.classList.toggle('secondary',!selected);b.setAttribute('aria-pressed',String(selected));});if(showExpenses){refresh();sync();}}
  tabs.querySelector('#savingsTab').onclick=()=>select(false);
  tabs.querySelector('#expensesTab').onclick=()=>select(true);
  panel.querySelector('#expenseSync').onclick=sync;
  // Observe existing savings rendering without changing its functions or formulas.
  new MutationObserver(refresh).observe(document.getElementById('goals'),{childList:true});
  window.addEventListener('online',()=>{if(!panel.hidden)sync();});
  refresh();
})();
