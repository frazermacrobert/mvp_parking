// Minimal, zero-build app using Supabase ESM CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.5'

const SUPA_URL = 'https://gukoruzworxkixrygudn.supabase.co'
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a29ydXp3b3J4a2l4cnlndWRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NzAyNzksImV4cCI6MjA3ODM0NjI3OX0.e2EEM2bLy_0JehSrQfTMH9VkJ0x61jjrsvyNor7OuC8'
const supa = createClient(SUPA_URL, SUPA_KEY)

const state = {
  weekStart: monday(new Date()),
  resources: [],
  employees: [],
  bookings: [],
  adminPass: null,
  modal: { open:false, resource_id:null, date:null }
}

function monday(d) {
  const day = d.getDay() || 7
  const m = new Date(d)
  m.setDate(d.getDate() - day + 1)
  m.setHours(0,0,0,0)
  return m
}
function addDays(d, n) { const x = new Date(d); x.setDate(d.getDate()+n); return x }
function fmt(d) { return d.toISOString().slice(0,10) }
function isWeekday(d) { const g=d.getDay(); return g>=1 && g<=5 }

const weekLabel = document.getElementById('weekLabel')
const prevWeek = document.getElementById('prevWeek')
const nextWeek = document.getElementById('nextWeek')
const datePicker = document.getElementById('datePicker')
const daysEl = document.getElementById('days')
const waitlistEl = document.getElementById('waitlist')
const modal = document.getElementById('modal')
const employeeSelect = document.getElementById('employeeSelect')
const noteInput = document.getElementById('noteInput')
const modalClose = document.getElementById('modalClose')
const modalSubmit = document.getElementById('modalSubmit')
const adminPassInput = document.getElementById('adminPass')
const adminUnlock = document.getElementById('adminUnlock')
const adminLock = document.getElementById('adminLock')

prevWeek.onclick = () => { state.weekStart = addDays(state.weekStart, -7); refresh() }
nextWeek.onclick = () => { state.weekStart = addDays(state.weekStart, 7); refresh() }
datePicker.onchange = e => { const d=new Date(e.target.value+'T00:00:00'); state.weekStart=monday(d); refresh() }
modalClose.onclick = () => hideModal()
modalSubmit.onclick = submitRequest
adminUnlock.onclick = () => { state.adminPass = adminPassInput.value || null; toggleAdminUI(true) }
adminLock.onclick = () => { state.adminPass = null; toggleAdminUI(false) }

function toggleAdminUI(on) {
  document.getElementById('adminUnlock').style.display = on ? 'none':'inline-block'
  document.getElementById('adminLock').style.display = on ? 'inline-block':'none'
  // Re-render so confirmed chips become clickable (or not) immediately
  render()
  renderWaitlist()
}

async function init(){
  await Promise.all([loadResources(), loadEmployees()])
  refresh()
}

async function loadResources(){
  const { data, error } = await supa.from('resources').select('*').eq('is_active', true).order('label')
  if(error) { console.error(error); return }
  state.resources = data
}

async function loadEmployees(){
  const { data, error } = await supa.from('employees').select('id,name,department,is_active').eq('is_active', true).order('name')
  if(error) { console.error(error); return }
  state.employees = data
  employeeSelect.innerHTML = '<option value="">Pick your name</option>' + data.map(e => `<option value="${e.id}">${e.name} · ${e.department}</option>`).join('')
}

async function loadBookings(){
  const startISO = fmt(state.weekStart)
  const end = addDays(state.weekStart, 7)
  const { data, error } = await supa
    .from('bookings').select('*')
    .gte('date', startISO).lt('date', fmt(end))
    .in('status',['pending','confirmed'])
  if(error) { console.error(error); return }
  state.bookings = data
}

function statusFor(resource_id, dateISO){
  const d = state.bookings.filter(b => b.resource_id===resource_id && b.date===dateISO)
  const confirmed = d.find(b => b.status==='confirmed')
  if(confirmed) {
    const emp = state.employees.find(e => e.id === confirmed.employee_id)
    const label = emp ? emp.name.split(' ')[0] : 'CONF'
    return { s:'confirmed', label:label, booking: confirmed }
  }
  const pending = d.find(b => b.status==='pending')
  if(pending) return { s:'pending', label:'PEND', booking: pending }
  return { s:'empty', label:'+' }
}

function render(){
  const end = addDays(state.weekStart, 4)
  weekLabel.textContent = state.weekStart.toDateString().slice(0,10) + ' to ' + end.toDateString().slice(0,10)

  daysEl.innerHTML = ''
  const cars = state.resources.filter(r=> r.kind==='car')
  const desks = state.resources.filter(r=> r.kind==='desk')
  const days = Array.from({length:7},(_,i)=> addDays(state.weekStart,i)).filter(isWeekday)

  for(const d of days){
    const dayDiv = document.createElement('div')
    dayDiv.className='day'
    const h = document.createElement('h4')
    h.textContent = d.toLocaleDateString(undefined, {weekday:'long', day:'numeric', month:'short'})
    dayDiv.appendChild(h)

    // Car row
    {
      const wrap = document.createElement('div')
      wrap.innerHTML = '<div class="footer-note">Car park</div>'
      const row = document.createElement('div')
      row.style.display='grid'; row.style.gridTemplateColumns='repeat(5,1fr)'; row.style.gap='8px'
      for(const r of cars){
        const st = statusFor(r.id, fmt(d))
        const btn = document.createElement('button')
        btn.className = 'badge ' + (st.s==='confirmed'?'confirmed': st.s==='pending'?'pending':'empty')
        btn.textContent = r.label + ' · ' + st.label

        if (st.s === 'empty' || st.s === 'pending' || st.s === 'confirmed') {
          btn.onclick = () => showModal(r.id, fmt(d));
          btn.style.cursor = 'pointer';
        } else {
          btn.onclick = null;
        }

        if (st.s === 'confirmed' && state.adminPass) {
          btn.title = 'Free this slot';
          btn.style.cursor = 'pointer';
          btn.style.outline = '2px dashed #f5c2c7';
          btn.onclick = () => {
            if (confirm(`Free ${r.label} on ${fmt(d)}?`)) {
              adminFree(r.id, fmt(d));
            }
          };
        }

        row.appendChild(btn)
      }
      wrap.appendChild(row)
      dayDiv.appendChild(wrap)
    }

    // Desk row
    {
      const wrap = document.createElement('div')
      wrap.innerHTML = '<div class="footer-note">Desks</div>'
      const row = document.createElement('div')
      row.style.display='grid'; row.style.gridTemplateColumns='repeat(9,1fr)'; row.style.gap='8px'
      for(const r of desks){
        const st = statusFor(r.id, fmt(d))
        const btn = document.createElement('button')
        btn.className = 'badge ' + (st.s==='confirmed'?'confirmed': st.s==='pending'?'pending':'empty')
        btn.textContent = r.label + ' · ' + st.label

        if (st.s === 'empty' || st.s === 'pending' || st.s === 'confirmed') {
          btn.onclick = () => showModal(r.id, fmt(d));
          btn.style.cursor = 'pointer';
        } else {
          btn.onclick = null;
        }

        if (st.s === 'confirmed' && state.adminPass) {
          btn.title = 'Free this slot';
          btn.style.cursor = 'pointer';
          btn.style.outline = '2px dashed #f5c2c7';
          btn.onclick = () => {
            if (confirm(`Free ${r.label} on ${fmt(d)}?`)) {
              adminFree(r.id, fmt(d));
            }
          };
        }

        row.appendChild(btn)
      }
      wrap.appendChild(row)
      dayDiv.appendChild(wrap)
    }

    daysEl.appendChild(dayDiv)
  }

  renderWaitlist()
}

function renderWaitlist(){
  const pending = state.bookings
    .filter(b=> b.status==='pending')
    .sort((a,b)=> new Date(a.requested_at)-new Date(b.requested_at))

  if(!pending.length) {
    waitlistEl.innerHTML = '<p class="footer-note">No pending requests this week.</p>'
    return
  }
  waitlistEl.innerHTML = ''
  for(const p of pending){
    const div = document.createElement('div')
    div.className='waitlist-item'
    const emp = state.employees.find(e=> e.id===p.employee_id)
    const res = state.resources.find(r=> r.id===p.resource_id)
    div.innerHTML = `<div><strong>${emp?.name || 'Unknown'}</strong> <span class="footer-note">· ${res?.kind} · ${res?.label} · ${p.date}</span></div>`
    const actions = document.createElement('div')
    const approveBtn = document.createElement('button'); approveBtn.textContent='Approve'
    const rejectBtn = document.createElement('button'); rejectBtn.textContent='Reject'; rejectBtn.style.marginLeft='8px'

    const hasConfirmed = state.bookings.find(b => b.resource_id === p.resource_id && b.date === p.date && b.status === 'confirmed');
    if (hasConfirmed) {
      approveBtn.disabled = true;
      approveBtn.title = 'Slot is already confirmed for another person';
    } else {
      approveBtn.onclick = () => adminApprove(p.id);
    }
    rejectBtn.onclick = () => adminReject(p.id)
    if(!state.adminPass) actions.style.display='none'
    actions.appendChild(approveBtn); actions.appendChild(rejectBtn)
    div.appendChild(actions)
    waitlistEl.appendChild(div)
  }
}

function showModal(resource_id, date){
  state.modal = { open:true, resource_id, date }
  modal.hidden = false
}
function hideModal(){
  state.modal = { open:false, resource_id:null, date:null }
  modal.hidden = true
}

async function submitRequest(){
  const emp = employeeSelect.value
  if(!emp) return alert('Pick your name')
  if(!state.modal.resource_id || !state.modal.date){
    return alert('Pick a slot first')
  }
  try {
    const { error } = await supa.rpc('enforce_quota_and_create', {
      p_resource_id: state.modal.resource_id,
      p_date: state.modal.date,
      p_employee_id: emp,
      p_note: noteInput.value || null
    })
    if(error) throw error
    hideModal()
    await refresh()
  } catch(err) {
    alert(err.message || err)
  }
}

async function adminApprove(bookingId){
  if(!state.adminPass) return alert('Unlock admin first')
  const { error } = await supa.rpc('approve_booking', { p_booking_id: bookingId, p_passphrase: state.adminPass })
  if(error) return alert(error.message || error)
  await refresh()
}
async function adminReject(bookingId){
  if(!state.adminPass) return alert('Unlock admin first')
  const { error } = await supa.rpc('reject_booking', { p_booking_id: bookingId, p_passphrase: state.adminPass })
  if(error) return alert(error.message || error)
  await refresh()
}

async function adminFree(resourceId, date){
  if(!state.adminPass) return alert('Unlock admin first')
  const { error } = await supa.rpc('free_slot', {
    p_resource_id: resourceId,
    p_date: date,
    p_passphrase: state.adminPass
  })
  if(error) return alert(error.message || error)

  // Auto-promote next pending request for this slot and date (if any)
  await supa.rpc('promote_next_waitlist', {
    p_resource_id: resourceId,
    p_date: date,
    p_passphrase: state.adminPass
  })

  await refresh()
}

async function refresh(){
  await loadBookings()
  render()
}

init().catch(console.error)
