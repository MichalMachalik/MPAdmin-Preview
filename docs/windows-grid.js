function reveal(cell) {
  const scroller = cell.closest('.table-scroll');
  const bounds = scroller.getBoundingClientRect();
  const viewportLeft = bounds.left + scroller.clientLeft;
  const viewportTop = bounds.top + scroller.clientTop;
  const right = viewportLeft + scroller.clientWidth;
  const bottom = viewportTop + scroller.clientHeight;
  const rect = cell.getBoundingClientRect();
  const table = cell.closest('table');
  const top = viewportTop + table.tHead.offsetHeight;
  const frozen = table.rows[0].querySelectorAll('.row-pointer, .frozen-column');
  const left = viewportLeft + [...frozen].reduce((sum, heading) => sum + heading.offsetWidth, 0);
  if (rect.top < top) scroller.scrollTop -= top - rect.top;
  if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
  if (cell.matches('.frozen-column')) return;
  if (rect.left < left) scroller.scrollLeft -= left - rect.left;
  if (rect.right > right) scroller.scrollLeft += rect.right - right;
}

function rowPage(table) {
  const viewport = table.closest('.table-scroll');
  const height = Math.min(viewport.clientHeight, innerHeight - viewport.getBoundingClientRect().top) - table.tHead.offsetHeight;
  return Math.max(1, Math.floor(height / 24) - 1);
}

export function createWindowsEditorGrid(editor, { commitValue, selectCell, confirmStart, reportError, clearError }) {
  const selections = new WeakMap();
  let editing;
  let pointerType;

  function initialize() {
    for (const table of editor.querySelectorAll('.native-edit-grid')) {
      if (selections.has(table)) continue;
      const rows = [...table.tBodies[0].rows].map(row => [...row.cells].slice(1));
      const selection = { table, rows, cell: null, anchor: null, extra: new Set() };
      selections.set(table, selection);
      for (const row of rows) {
        for (const cell of row) {
          const input = cell.querySelector('input');
          cell.tabIndex = -1;
          cell.setAttribute('role', 'gridcell');
          cell.setAttribute('aria-readonly', String(!input || input.disabled || input.readOnly));
          if (input) input.tabIndex = -1;
        }
      }
      if (rows.length) choose(rows[0][0], false);
    }
  }

  function current() {
    const table = editor.querySelector('section:not([hidden]) .native-edit-grid');
    return table && selections.get(table)?.cell;
  }

  function setHighlighted(selection, cell, method) {
    for (const previous of selection.extra) {
      previous.classList.remove('in-selection');
      if (previous !== cell) previous.removeAttribute('aria-selected');
    }
    selection.extra.clear();
    if (!method || !selection.anchor) {
      selection.anchor = cell;
      return;
    }
    const { rows, anchor, table } = selection;
    const index = item => item.parentElement.rowIndex - table.tHead.rows.length;
    const firstRow = Math.min(index(cell), index(anchor));
    const lastRow = Math.max(index(cell), index(anchor));
    const firstColumn = method === 'row' ? 0 : Math.min(cell.cellIndex, anchor.cellIndex) - 1;
    const lastColumn = method === 'row' ? rows[firstRow].length - 1 : Math.max(cell.cellIndex, anchor.cellIndex) - 1;
    for (const row of rows.slice(firstRow, lastRow + 1)) {
      for (const member of row.slice(firstColumn, lastColumn + 1)) {
        selection.extra.add(member);
        member.classList.add('in-selection');
        member.setAttribute('aria-selected', 'true');
      }
    }
  }

  function choose(cell, focus = true, method) {
    if (!cell) return;
    const selection = selections.get(cell.closest('table'));
    if (!selection) return;
    const oldCell = selection.cell;
    if (oldCell) {
      oldCell.tabIndex = -1;
      oldCell.classList.remove('is-current');
      oldCell.removeAttribute('aria-selected');
      oldCell.parentElement.classList.remove('is-current-row');
    }
    selection.cell = cell;
    cell.tabIndex = 0;
    cell.classList.add('is-current');
    cell.parentElement.classList.add('is-current-row');
    setHighlighted(selection, cell, method);
    cell.setAttribute('aria-selected', 'true');
    if (focus) {
      cell.focus({ preventScroll: true });
      reveal(cell);
    }
    if (focus && !cell.closest('[hidden]')) selectCell(cell.querySelector('input'));
  }

  function startEdit(cell, kind, value, confirmed = false) {
    if (editing?.cell === cell) {
      if (kind === 'select') editing.input.select();
      return;
    }
    const input = cell.querySelector('input');
    if (!input || input.disabled || !finish()) return;
    choose(cell, false);
    if (input.readOnly) {
      if (input.classList.contains('start') && !confirmed) {
        cell.focus({ preventScroll: true });
        reveal(cell);
        selectCell(input, false);
        confirmStart(() => {
          if (!input.isConnected || input.disabled) return;
          input.readOnly = false;
          startEdit(cell, kind, value, true);
        });
      }
      return;
    }
    editing = { cell, input, original: input.value };
    cell.classList.add('is-editing');
    cell.setAttribute('aria-readonly', 'false');
    input.tabIndex = 0;
    cell.tabIndex = -1;
    selectCell(input, false);
    reveal(cell);
    input.focus({ preventScroll: true });
    if (value !== undefined) input.value = value;
    if (kind === 'select') input.select();
    if (kind === 'caret' || value !== undefined) input.setSelectionRange(input.value.length, input.value.length);
  }

  function stopEdit() {
    const { cell, input } = editing;
    editing = undefined;
    if (input.classList.contains('start')) input.readOnly = true;
    input.tabIndex = -1;
    cell.tabIndex = 0;
    cell.classList.remove('is-editing', 'has-error');
    cell.setAttribute('aria-readonly', String(input.readOnly || input.disabled));
    input.removeAttribute('aria-invalid');
  }

  function finish() {
    if (!editing) return true;
    const { input, original, cell } = editing;
    if (input.value !== original && !commitValue(input)) {
      cell.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      reportError('Do této buňky můžete psát jen čísla!');
      return false;
    }
    stopEdit();
    return true;
  }

  function cancel() {
    const { input, original, cell } = editing;
    input.value = original;
    stopEdit();
    clearError();
    choose(cell);
  }

  function destination(event, cell) {
    const table = cell.closest('table');
    const { rows } = selections.get(table);
    let row = cell.parentElement.rowIndex - table.tHead.rows.length;
    let column = cell.cellIndex - 1;
    const last = rows[0].length - 1;
    switch (event.key) {
      case 'ArrowUp': row--; break;
      case 'Enter': row += event.shiftKey ? -1 : 1; break;
      case 'ArrowDown': row++; break;
      case 'ArrowLeft': column = event.ctrlKey ? 0 : column - 1; break;
      case 'ArrowRight': column = event.ctrlKey ? last : column + 1; break;
      case 'Home': column = 0; if (event.ctrlKey) row = 0; break;
      case 'End': column = last; if (event.ctrlKey) row = rows.length - 1; break;
      case 'PageUp': row -= rowPage(table); break;
      case 'PageDown': row += rowPage(table); break;
      case 'Tab': {
        const next = row * (last + 1) + column + (event.shiftKey ? -1 : 1);
        if (next < 0 || next >= rows.length * (last + 1)) return null;
        row = Math.floor(next / (last + 1));
        column = next % (last + 1);
        break;
      }
      default: return undefined;
    }
    return rows[Math.max(0, Math.min(rows.length - 1, row))][Math.max(0, Math.min(last, column))];
  }

  function cellAt(target) {
    const cell = target.closest('.native-edit-grid tbody :is(td, th)');
    return cell && !cell.classList.contains('row-pointer') ? cell : null;
  }

  editor.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const cell = cellAt(event.target);
    if (!cell) return;
    pointerType = event.pointerType;
    if (event.pointerType === 'mouse' && event.target.matches('input') && editing?.cell !== cell) event.preventDefault();
  });
  editor.addEventListener('click', event => {
    const header = event.target.closest('.adjustments tbody .row-pointer');
    const cell = header?.nextElementSibling ?? cellAt(event.target);
    if (!cell || editing?.cell === cell) return;
    if (!finish()) { editing.input.focus(); return; }
    if (header) choose(cell, false);
    const input = cell.querySelector('input');
    const touch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents || pointerType === 'touch';
    pointerType = undefined;
    if (input && !input.disabled && (input.matches('.start[readonly]') || touch)) {
      choose(cell, false);
      startEdit(cell, 'select');
    } else choose(cell, true, header ? 'row' : event.shiftKey ? 'range' : undefined);
  });
  editor.addEventListener('dblclick', event => {
    const cell = cellAt(event.target);
    if (cell) startEdit(cell, 'select');
  });
  editor.addEventListener('focusin', event => {
    const cell = cellAt(event.target);
    if (!cell || editing?.cell === cell) return;
    if (event.target.matches('input:not(:read-only):enabled')) startEdit(cell);
    else {
      if (selections.get(cell.closest('table'))?.cell !== cell && finish()) choose(cell, false);
      selectCell(cell.querySelector('input'), false);
    }
  });
  editor.addEventListener('focusout', event => {
    if (editing?.input !== event.target || finish()) return;
    const input = event.target;
    queueMicrotask(() => {
      if (editing?.input === input && input.isConnected && editor.open && !document.querySelector('dialog[open]:modal')) input.focus();
    });
  });
  editor.addEventListener('paste', event => {
    const cell = cellAt(event.target);
    if (!cell || editing?.cell === cell) return;
    const value = event.clipboardData?.getData('text/plain');
    if (value === undefined) return;
    event.preventDefault();
    startEdit(cell, 'caret', value.replace(/\r?\n/g, ' ').slice(0, cell.querySelector('input')?.maxLength ?? 0));
  });
  editor.addEventListener('copy', event => {
    const cell = cellAt(event.target);
    if (!cell || editing?.cell === cell || !event.clipboardData) return;
    const selection = selections.get(cell.closest('table'));
    const cells = selection.extra.size ? [...selection.extra] : [cell];
    const rows = new Map();
    const text = member => member.querySelector('input')?.value ?? member.textContent.trim();
    for (const member of cells) {
      const key = member.parentElement;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(text(member));
    }
    event.clipboardData.setData('text/plain', [...rows.values()].map(row => row.join('\t')).join('\r\n'));
    event.preventDefault();
  });
  editor.addEventListener('keydown', event => {
    const cell = cellAt(event.target);
    if (!cell || event.isComposing || event.altKey || event.metaKey) return;
    if (event.key === 'Escape' && editing?.cell === cell) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (!editing && !event.ctrlKey && (event.key === 'F2' || event.key === 'Delete' || event.key.length === 1)) {
      event.preventDefault();
      const value = event.key === 'Delete' ? '' : event.key.length === 1 ? event.key : undefined;
      startEdit(cell, 'caret', value);
      return;
    }
    if (editing?.cell === cell) {
      const input = editing.input;
      if (event.key === 'Home' || event.key === 'End' || event.key === 'ArrowLeft' && (event.shiftKey || input.selectionStart !== 0 || input.selectionEnd !== 0) ||
          event.key === 'ArrowRight' && (event.shiftKey || input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length)) return;
    }
    const next = destination(event, cell);
    if (next === undefined) return;
    if (!finish()) { event.preventDefault(); return; }
    if (next === null) {
      if (event.target.matches('input')) cell.focus({ preventScroll: true });
      return;
    }
    event.preventDefault();
    choose(next, true, event.shiftKey && !['Tab', 'Enter'].includes(event.key) ? 'range' : undefined);
  });

  return {
    initialize,
    finish,
    focusCurrent: () => choose(current()),
    refreshCurrent: () => selectCell(current()?.querySelector('input')),
  };
}

export function createWindowsListControls(app, openRecord) {
  const remembered = new Map();
  let touch;
  let moved = false;

  function rows(list) {
    return [...list.querySelectorAll('tbody tr[data-record]')];
  }
  function select(row, focus = false, column) {
    const list = row.closest('.native-list');
    const previous = list.querySelector('tr.is-selected');
    if (previous && previous !== row) {
      previous.tabIndex = -1;
      previous.classList.remove('is-selected');
    }
    row.classList.add('is-selected');
    row.tabIndex = 0;
    const activeColumn = Math.max(1, Math.min(row.cells.length-1, column ?? remembered.get(list.dataset.listKey)?.column ?? 1));
    remembered.set(list.dataset.listKey, { record:row.dataset.record, column:activeColumn });
    if (focus) {
      row.focus({ preventScroll: true });
      reveal(row.cells[activeColumn]);
    }
  }
  function open(row) {
    if (row.closest('.native-list')?.hidden) return;
    select(row);
    openRecord(row.dataset.type, row.dataset.record);
  }
  app.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.pointerType === 'mouse' && event.target.closest('.native-list tbody button')) event.preventDefault();
  });
  app.addEventListener('click', event => {
    const row = event.target.closest('.native-list tbody tr[data-record]');
    if (!row) return;
    if (event.target.closest('button')) {
      event.stopPropagation();
      if (event.detail === 0) { open(row); return; }
    }
    select(row, true, event.target.closest('td')?.cellIndex);
  });
  app.addEventListener('touchstart', event => {
    const row = event.target.closest('.native-list tbody tr[data-record]');
    moved = false;
    if (row && touch?.row !== row) touch = undefined;
  }, { passive: true });
  app.addEventListener('touchmove', () => { moved = true; touch = undefined; }, { passive: true });
  app.addEventListener('touchend', event => {
    const row = event.target.closest('.native-list tbody tr[data-record]');
    if (!row || moved || event.changedTouches.length !== 1 || event.touches.length) {
      touch = undefined;
      return;
    }
    const now = performance.now();
    if (touch?.row === row && now - touch.time < 500) {
      if (event.cancelable) event.preventDefault();
      touch = undefined;
      open(row);
    } else touch = { row, time: now };
  }, { passive: false });
  app.addEventListener('dblclick', event => {
    const row = event.target.closest('.native-list tbody tr[data-record]');
    if (row) open(row);
  });
  app.addEventListener('keydown', event => {
    const row = event.target.closest('.native-list tbody tr[data-record]');
    if (!row || event.altKey || event.metaKey) return;
    if (event.key === ' ' || (event.key === 'Enter' && event.ctrlKey)) { event.preventDefault(); open(row); return; }
    const table = row.closest('table');
    const list = row.closest('.native-list');
    const listRows = rows(list);
    const index = listRows.indexOf(row);
    let column = remembered.get(list.dataset.listKey)?.column ?? 1;
    let next;
    switch (event.key) {
      case 'Enter': next = index + (event.shiftKey ? -1 : 1); break;
      case 'ArrowUp': next = index - 1; break;
      case 'ArrowDown': next = index + 1; break;
      case 'ArrowLeft': next = index; column--; break;
      case 'ArrowRight': next = index; column++; break;
      case 'PageUp': next = index - rowPage(table); break;
      case 'PageDown': next = index + rowPage(table); break;
      case 'Home': next = event.ctrlKey ? 0 : index; column = 1; break;
      case 'End': next = event.ctrlKey ? listRows.length - 1 : index; column = row.cells.length - 1; break;
      default: return;
    }
    event.preventDefault();
    select(listRows[Math.max(0, Math.min(listRows.length - 1, next))], true, column);
  });
  return {
    initialize() {
      const list = app.querySelector('.native-list');
      if (!list) return;
      for (const item of list.querySelectorAll('tbody button')) item.tabIndex = -1;
      const listRows = rows(list);
      const first = listRows.find(row => row.dataset.record === remembered.get(list.dataset.listKey)?.record) ?? listRows[0];
      if (first) select(first);
    },
    focus() { app.querySelector('.native-list .is-selected')?.focus({ preventScroll: true }); },
    reset() { remembered.clear(); },
  };
}
