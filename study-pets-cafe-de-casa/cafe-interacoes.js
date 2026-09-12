(() => {
  const root=document.getElementById('cp-cafe');
  const $=id=>document.getElementById(id);
  const text=(id,value)=>{$(id).textContent=value;};
  const petImages={"cat": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAx0lEQVR42mNgGAVDBbyYYfefmurIcgAhw4lRQ5ED3vRMw2kBIXmqhgI+TBfLN6UoYaVpHgXoGN1imBhNHVBxIuC/nKQkiqUgPkh8ZDgAhH+9OIGB6RYFyA4AZbsBcwDIImR6QEIAWxQM34II2RG4QoAuluNzAL74p0raoMQBVAmhAXUAJQURVXyPXPEMiAPQsxu24KdbCJDiAKplT3JDgGoOICcEqFo6EiqC0R1ANcvRy3lsBmOzmGq1Ir78D5Kne8NkFFAbAAAOs/w8E8MSVwAAAABJRU5ErkJggg==", "dog": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAw0lEQVR42mNgGAWjYKiBa5O8/uPCA2YxzR1CiuVUdQQ5FoPwggQN6jgE2SAY1pCT/A8C+MRg+kA0xQ54MW0BhmUgjE8Mpo8qDkAPga/3tuDENAkBXA6A+RqEaeYAbAmMFAfQJDcgBznIImxRQPOyAF/807REJMYBA2I5siPQEx6yvgFxALLeoekAcgsimEMo9v2gcwC+XIBcAlKtMCLXAVTLlpSEAM0aJSPHAejlOzEOQFZH1eoY3UJkdfiy42hHZtADANsB2/p6SD89AAAAAElFTkSuQmCC", "dove": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAmklEQVR42mNgGAWjYBSMAiqADx++/ceFB9RyujgCl6Vychpg+siJa/8HNARADngzzQaMB9QBwzcR4nMAXVM6zRxAruVUcwQsIRHC2BIfxVmQGItxOYJsB2AzhG4OQDeIXMup5gBSHELVNIDLYGIAVRMhepoYEAcgO4IUB1C9GCbFATQv+7HVbjSv8QaNA2CNC+RGBjaxUTBkAABvNqTsu9dabgAAAABJRU5ErkJggg=="};
  const pets=[{id:'cat',name:'Mochi',level:4},{id:'dog',name:'Amora',level:2},{id:'dove',name:'Pipa',level:1}];
  const plans=new Map([[0,[{id:1,name:'Pomodoro 1',time:'09:00',minutes:25,kind:'study',done:true},{id:2,name:'Pomodoro 2',time:'09:30',minutes:25,kind:'study',done:false},{id:3,name:'Pausa',time:'09:55',minutes:5,kind:'break',done:false},{id:4,name:'Pomodoro 3',time:'10:00',minutes:25,kind:'study',done:false},{id:5,name:'Almoço',time:'12:00',minutes:60,kind:'event',done:false},{id:6,name:'Aula de inglês',time:'14:00',minutes:60,kind:'event',done:false}]]]);
  const state={page:'day',day:0,selected:2,pet:'cat',edit:null,session:null,density:'confortavel'};
  let nextId=7,lastRemoved=null;
  const rows=()=>plans.get(state.day)||[];
  const currentPet=()=>pets.find(p=>p.id===state.pet);
  const currentStudy=()=>rows().find(r=>r.id===state.selected&&!r.done&&r.kind==='study')||rows().find(r=>!r.done&&r.kind==='study');
  const icon=name=>{const el=document.createElement('i');el.dataset.lucide=name;el.setAttribute('aria-hidden','true');return el;};
  const make=(tag,cls,content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;};
  const icons=()=>{if(globalThis.lucide)lucide.createIcons({attrs:{width:16,height:16}});};
  function feedback(message,undo=false){text('cp-feedback-text',message);$('cp-feedback').hidden=false;$('cp-undo').hidden=!undo;}
  function clearFeedback(){$('cp-feedback').hidden=true;$('cp-undo').hidden=true;}
  function dayDate(){const date=new Date(Date.UTC(2026,8,7+state.day));return date.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).replace('-feira','').replace(/^./,s=>s.toUpperCase());}
  function clock(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  const minuteOf=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
  const hourLabel=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  function freeSlot(start,end){const button=make('button','cp-free-slot');button.type='button';button.setAttribute('aria-label','Adicionar atividade no horário livre de '+hourLabel(start)+' às '+hourLabel(end));const details=make('span');const duration=end-start;const durationLabel=duration<60?duration+' min':Math.floor(duration/60)+'h'+(duration%60?' '+duration%60+' min':'');details.append(make('span','',hourLabel(start)+'–'+hourLabel(end)),make('small','',durationLabel+(duration===60?' livre':' livres')));const add=make('span','cp-slot-add');add.append(icon('plus'),make('span','','Adicionar aqui'));button.append(details,add);button.addEventListener('click',()=>openEditor(null,hourLabel(start),end-start));return button;}
  function renderAgenda(){
    const list=$('cp-activities');list.replaceChildren();const study=currentStudy();let cursor=540;
    if(!rows().length){const empty=make('div','cp-empty');empty.append(make('strong','','Seu dia está livre.'),make('p','','Comece pelo horário que funciona para você.'));list.append(empty);}
    rows().forEach(row=>{
      const start=minuteOf(row.time),end=start+row.minutes;if(Math.min(start,1020)-cursor>=15)list.append(freeSlot(cursor,Math.min(start,1020)));cursor=Math.max(cursor,end);
      const wrap=make('div','cp-activity kind-'+row.kind+(row.done?' is-done':study&&study.id===row.id?' is-selected':''));
      const time=make('span','cp-time-range');time.setAttribute('aria-label',row.time+' às '+hourLabel(end));time.append(make('span','',row.time),make('small','',hourLabel(end)));
      const copy=make('span','cp-row-copy');copy.append(make('strong','',row.name));
      if(row.done){copy.append(make('small','','Concluído · '+row.minutes+' min'));const done=make('div','cp-done-content');done.append(time,copy,icon('circle-check'));wrap.append(done);}
      else {
        const active=!!state.session&&state.session.row.id===row.id;
        const kind=row.kind==='study'?'Pomodoro':row.kind==='event'?'Compromisso':'Pausa';
        copy.append(make('small','',(active?'Em andamento':kind)+' · '+row.minutes+' min'));
        const select=make('button','cp-select-activity');select.type='button';select.setAttribute('aria-label',(active?'Abrir foco de ':'Editar ')+row.name+' às '+row.time);const hint=make('span','cp-edit-hint');hint.append(icon('pencil'),make('span','','Editar'));select.append(time,copy);if(!active)select.append(hint);select.addEventListener('click',()=>active?go('focus'):openEditor(row));wrap.append(select);
        if(row.kind==='study'){const startButton=make('button','cp-study-action',active?'Foco':'Estudar');startButton.type='button';startButton.setAttribute('aria-label',active?'Voltar ao foco':'Começar '+row.name);startButton.disabled=!!state.session&&!active;startButton.addEventListener('click',()=>startStudy(row));wrap.append(startButton);}
      }
      list.append(wrap);
    });
    if(1020-cursor>=15)list.append(freeSlot(cursor,1020));
    const all=rows().filter(r=>r.kind==='study');const done=all.filter(r=>r.done);
    const count=(kind,one,many)=>{const n=rows().filter(r=>r.kind===kind).length;return n?n+' '+(n===1?one:many):null;};text('cp-plan-overview',[count('study','pomodoro','pomodoros'),count('event','compromisso','compromissos'),count('break','pausa','pausas')].filter(Boolean).join(' · ')||'Nenhuma atividade planejada');
    text('cp-day-summary',(all.length?done.length+' de '+all.length+' pomodoros concluídos · ':'')+'Horários livres mostrados das 09h às 17h');
    text('cp-progress-blocks',done.length+' de '+all.length);text('cp-progress-minutes',done.reduce((n,r)=>n+r.minutes,0)+' min');
    text('cp-progress-message',done.length?'Cada Pomodoro concluído faz parte do seu progresso.':'Seu próximo passo começa na agenda.');
  }
  function renderPets(){
    const list=$('cp-pet-grid');list.replaceChildren();
    pets.forEach(p=>{const card=make('article','cp-pet-choice'+(state.pet===p.id?' active':''));const img=make('img');img.src=petImages[p.id];img.alt=p.name;img.width=118;img.height=118;const button=make('button',state.pet===p.id?'cp-primary':'cp-secondary',state.pet===p.id?'Seu companheiro':'Escolher '+p.name);button.type='button';button.setAttribute('aria-pressed',String(state.pet===p.id));button.addEventListener('click',()=>{state.pet=p.id;render();feedback(p.name+' vai estudar com você.');});card.append(img,make('h3','',p.name),make('p','','Nível '+p.level),button);list.append(card);});
  }
  function render(){
    plans.forEach(list=>{let n=0;list.sort((a,b)=>a.time.localeCompare(b.time));list.forEach(row=>{if(row.kind==='study')row.name='Pomodoro '+(++n);else if(row.kind==='break')row.name='Pausa';});});
    ['day','pets','progress','focus'].forEach(page=>{$('cp-'+page).hidden=state.page!==page;});
    root.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===state.page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    root.dataset.density=state.density;text('cp-date-label',dayDate());
    const study=currentStudy();const active=state.session;
    text('cp-next-label',active?'POMODORO EM ANDAMENTO':study?'PRÓXIMO POMODORO · '+study.time:'NO SEU RITMO');
    text('cp-next-name',active?active.row.name:study?study.name:rows().length?'Sem pomodoros pendentes.':'Prepare seu próximo Pomodoro.');
    $('cp-next-duration').querySelector('span').textContent=active?'Seu tempo de foco continua contando.':study?study.minutes+' min de estudo.':'Sua agenda está pronta para novos planos.';
    $('cp-start').querySelector('span').textContent=active?'Voltar ao foco':study?'Iniciar Pomodoro':'Adicionar atividade';
    const pet=currentPet();text('cp-pet-name',pet.name);text('cp-pet-level','Nível '+pet.level);$('cp-room-pet').src=petImages[pet.id];$('cp-focus-pet').src=petImages[pet.id];$('cp-focus-pet').alt=pet.name+', seu companheiro de estudo';
    $('cp-session-banner').hidden=!active||state.page==='focus';
    if(active){text('cp-banner-name',active.row.name);text('cp-focus-name',active.row.name);text('cp-focus-kind',active.row.kind==='break'?'Pausa em andamento':'Pomodoro em andamento');const following=(plans.get(active.day)||[]).find(r=>r.time>active.row.time&&!r.done);text('cp-focus-next',following?'Depois: '+following.name.toLowerCase()+' · '+following.minutes+' min.':'Este é o último bloco do seu dia.');}
    renderAgenda();if(state.page==='pets')renderPets();tick();icons();
  }
  function go(page){state.page=page;$('cp-editor').hidden=true;clearFeedback();render();}
  function openEditor(row,time='10:30',space=25){state.edit=row?row.id:null;text('cp-editor-title',row?'Editar atividade':'Nova atividade');$('cp-form-error').hidden=true;$('cp-name').setCustomValidity('');$('cp-time').setCustomValidity('');$('cp-name').value=row&&row.kind==='event'?row.name:'';$('cp-time').value=row?row.time:time;$('cp-kind').value=row?row.kind:'study';$('cp-duration').value=String(row?row.minutes:space>=25?25:15);$('cp-remove').hidden=!row;$('cp-editor').hidden=false;clearFeedback();syncEditorKind();$(row&&row.kind==='event'?'cp-name':'cp-time').focus();}
  function syncEditorKind(){const isEvent=$('cp-kind').value==='event';$('cp-name-field').hidden=!isEvent;$('cp-name').required=isEvent;$('cp-name').disabled=!isEvent;$('cp-form-error').hidden=true;}
  $('cp-kind').addEventListener('change',()=>{syncEditorKind();if(state.edit===null)$('cp-duration').value=$('cp-kind').value==='break'?'5':$('cp-kind').value==='study'?'25':'60';});
  function startStudy(row){if(!state.session){state.selected=row.id;state.session={row,day:state.day,ends:Date.now()+row.minutes*60000};}go('focus');}
  function tick(){
    if(!state.session)return;
    const left=Math.max(0,Math.ceil((state.session.ends-Date.now())/1000));text('cp-focus-clock',clock(left));text('cp-banner-clock',clock(left));
    if(left===0){const s=state.session;s.row.done=true;state.session=null;state.page='day';state.day=s.day;feedback(s.row.name+' concluído.');render();}
  }
  root.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
  root.querySelectorAll('[data-go-pets]').forEach(b=>b.addEventListener('click',()=>go('pets')));
  root.querySelectorAll('[data-go-day]').forEach(b=>b.addEventListener('click',()=>go('day')));
  $('cp-prev').addEventListener('click',()=>{state.day--;state.selected=null;$('cp-editor').hidden=true;clearFeedback();render();});
  $('cp-next-day').addEventListener('click',()=>{state.day++;state.selected=null;$('cp-editor').hidden=true;clearFeedback();render();});
  $('cp-add').addEventListener('click',()=>openEditor(null));
  $('cp-cancel-edit').addEventListener('click',()=>{$('cp-editor').hidden=true;$('cp-add').focus();});
  function formError(message,field){text('cp-form-error',message);$('cp-form-error').hidden=false;$(field).focus();}
  function saveActivity(){
    const kind=$('cp-kind').value;const name=kind==='event'?$('cp-name').value.trim():kind==='study'?'Pomodoro':'Pausa';if(kind==='event'&&!name){formError('Dê um nome ao compromisso.','cp-name');return;}
    const dayRows=rows();const row=dayRows.find(r=>r.id===state.edit);const time=$('cp-time').value;const minutes=Number($('cp-duration').value);if(!time){formError('Escolha um horário.','cp-time');return;}const start=minuteOf(time);if(start+minutes>1440){formError('A atividade precisa terminar neste dia.','cp-time');return;}const overlaps=dayRows.some(r=>r.id!==state.edit&&start<minuteOf(r.time)+r.minutes&&start+minutes>minuteOf(r.time));
    if(overlaps){formError('Esse horário coincide com outra atividade. Escolha um horário livre.','cp-time');return;}
    if(row){Object.assign(row,{name,time,minutes,kind});}else{const created={id:nextId++,name,time,minutes,kind,done:false};dayRows.push(created);}
    dayRows.sort((a,b)=>a.time.localeCompare(b.time));plans.set(state.day,dayRows);state.selected=null;$('cp-editor').hidden=true;render();feedback(row?'Atividade atualizada.':'Atividade adicionada à sua agenda.');$('cp-add').focus();
  }
  $('cp-save').addEventListener('click',saveActivity);
  $('cp-editor').addEventListener('submit',event=>event.preventDefault());
  $('cp-editor').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();saveActivity();}});
  $('cp-name').addEventListener('input',()=>{$('cp-name').setCustomValidity('');});
  $('cp-time').addEventListener('input',()=>{$('cp-time').setCustomValidity('');});
  $('cp-duration').addEventListener('change',()=>{$('cp-time').setCustomValidity('');});
  $('cp-remove').addEventListener('click',()=>{const row=rows().find(r=>r.id===state.edit);if(!row)return;lastRemoved={row,day:state.day};plans.set(state.day,rows().filter(r=>r.id!==row.id));state.selected=null;$('cp-editor').hidden=true;render();feedback('Atividade removida da agenda.',true);$('cp-add').focus();});
  $('cp-undo').addEventListener('click',()=>{if(!lastRemoved)return;const list=plans.get(lastRemoved.day)||[];list.push(lastRemoved.row);list.sort((a,b)=>a.time.localeCompare(b.time));plans.set(lastRemoved.day,list);state.day=lastRemoved.day;state.page='day';lastRemoved=null;render();feedback('Atividade restaurada.');});
  $('cp-start').addEventListener('click',()=>{if(state.session){go('focus');return;}const study=currentStudy();if(!study){openEditor(null);return;}startStudy(study);});
  $('cp-return-focus').addEventListener('click',()=>go('focus'));
  $('cp-exit-focus').addEventListener('click',()=>go('day'));
  render();setInterval(tick,1000);
})();
