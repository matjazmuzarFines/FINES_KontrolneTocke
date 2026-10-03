import { expect, test } from '@playwright/test';

test('demo test saves atomically, shows results and survives reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Delovni nalogi',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'DEMO-2026-001',exact:true}).click();
  const unconfigured = page.getByRole('row').filter({hasText:'DEMO-HTB8-001'});
  await expect(unconfigured.getByRole('button',{name:'Začni test'})).toBeDisabled();
  const item = page.getByRole('row').filter({hasText:'DEMO-HTB5-001'});
  await item.getByRole('button',{name:'Začni test'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Naprej'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Vnesite rezultat');
  await dialog.getByRole('button',{name:'DA',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Opomba k rezultatu'}).fill('Preverjeno v avtomatiziranem demo testu.');
  await dialog.getByRole('button',{name:'Naprej'}).click();
  await expect(dialog.getByText('Vsi rezultati so ustrezni.',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Shrani test'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toContainText('Uspešno testiran');
  await page.reload();
  await item.getByRole('button',{name:'Rezultati'}).click();
  await expect(page.getByRole('dialog')).toContainText('Preverjeno v avtomatiziranem demo testu.');
  await page.getByRole('button',{name:'Zapri',exact:true}).click();
  await page.screenshot({path:`test-results/quality-${test.info().project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('procedures can be filtered, edited, copied, deleted and restored without deleting data', async ({ page }) => {
  await page.goto('/#postopki');
  await expect(page.getByRole('heading',{name:'Definicija kontrolnih postopkov',exact:true})).toBeVisible();
  const filters = page.getByRole('region',{name:'Filtri postopkov'});
  await filters.getByRole('textbox',{name:'ID postopka'}).fill('KP-0007');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await filters.getByRole('button',{name:'Počisti filtre'}).click();
  await filters.getByRole('combobox',{name:'Faza testa'}).selectOption({label:'Ročni test 200'});
  await expect(page.locator('tbody tr')).toHaveCount(169);
  await filters.getByRole('button',{name:'Počisti filtre'}).click();
  await filters.getByRole('combobox',{name:'Pripadnost'}).selectOption({label:'OPD'});
  await expect(page.locator('tbody tr').first()).toContainText('KP-0002');
  await expect(page.getByRole('row').filter({hasText:'KP-0001'})).toHaveCount(0);
  await filters.getByRole('button',{name:'Počisti filtre'}).click();
  await page.getByRole('button',{name:'Nov postopek'}).click();
  const detail = page.getByRole('complementary',{name:'Podrobnosti postopka'});
  await expect(detail.getByRole('textbox',{name:'ID postopka'})).toHaveAttribute('readonly','');
  await expect(detail.getByRole('textbox',{name:'ID postopka'})).toHaveValue('KP-0285');
  await detail.getByRole('textbox',{name:'Naziv postopka'}).fill('E2E kontrola površine');
  await detail.getByRole('group',{name:'Pripadnost'}).getByText('OCB').click();
  await detail.getByRole('group',{name:'Pripadnost'}).getByText('SCH').click();
  await detail.getByRole('textbox',{name:'Navodilo za izvajalca'}).fill('Preglej površino izdelka.');
  await detail.getByRole('button',{name:'Shrani postopek'}).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('row').filter({hasText:'E2E kontrola površine'});
  await expect(row).toContainText('Aktiven');
  await expect(page.locator('tbody tr').last()).toContainText('KP-0285');
  await row.getByRole('button',{name:'Kopiraj KP-0285'}).click();
  await expect(page.locator('tbody tr').last()).toContainText('KP-0286');
  await expect(detail.getByRole('textbox',{name:'Naziv postopka'})).toHaveValue('E2E kontrola površine (kopija)');
  await detail.getByRole('button',{name:'Shrani postopek'}).click();
  await page.keyboard.press('Escape');
  const copy = page.getByRole('row').filter({hasText:'(kopija)'});
  await expect(copy).toContainText('Aktiven');
  if (test.info().project.name === 'desktop') await expect(copy).toContainText('OCB, SCH');
  await row.filter({hasNotText:'(kopija)'}).getByRole('button',{name:'Izbriši KP-0285'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Izbriši postopek',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'KP-0285'})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Prikaži izbrisane'}).check();
  const hiddenRow = page.getByRole('row').filter({hasText:'KP-0285'});
  await expect(hiddenRow).toContainText('Izbrisan');
  await hiddenRow.getByRole('button',{name:'Obnovi KP-0285'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Obnovi postopek',exact:true}).click();
  await expect(hiddenRow).toContainText('Aktiven');
  await page.reload();
  await expect(hiddenRow).toBeVisible();
  await hiddenRow.click();
  await expect(detail.getByRole('textbox',{name:'Naziv postopka'})).toHaveValue('E2E kontrola površine');
  await page.screenshot({path:`test-results/procedures-${test.info().project.name}.png`,fullPage:true});
});

test('product association supports per-product instructions and persists', async ({ page }) => {
  await page.goto('/#izdelki');
  await page.getByRole('button',{name:'HTB8 100-302'}).click();
  await page.getByRole('button',{name:'Dodaj postopek',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox',{name:'Kontrolni postopek'}).selectOption({label:'KP-0007 · Napetost varovalk'});
  await page.getByRole('button',{name:'Nastavi povezavo'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Ime meritve'}).fill('U varovalk');
  await dialog.getByRole('spinbutton',{name:'Minimalna vrednost'}).fill('390');
  await dialog.getByRole('spinbutton',{name:'Maksimalna vrednost'}).fill('410');
  await dialog.getByRole('spinbutton',{name:'Nominalna vrednost'}).fill('400');
  await dialog.getByRole('textbox',{name:'Navodilo za izbrani artikel'}).fill('Izmeri napetost na HTB8.');
  await dialog.getByRole('button',{name:'Shrani povezavo'}).click();
  await expect(page.getByRole('row').filter({hasText:'Napetost varovalk'})).toContainText('390 / 410');
  await page.reload();
  await page.getByRole('button',{name:'HTB8 100-302'}).click();
  await page.getByRole('button',{name:'Uredi povezavo KP-0007'}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'Navodilo za izbrani artikel'})).toHaveValue('Izmeri napetost na HTB8.');
  await page.screenshot({path:`test-results/link-editor-${test.info().project.name}.png`,fullPage:true});
});

test('shell fits the viewport and exit can reopen the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByAltText('FINES d.o.o.')).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await page.getByRole('button',{name:'Izhod',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Aplikacija je zaprta'})).toBeVisible();
  await page.getByRole('button',{name:'Ponovno odpri aplikacijo'}).click();
  await expect(page.getByRole('heading',{name:'Delovni nalogi',exact:true})).toBeVisible();
});

test('procedure order can be changed with arrows and drag and drop', async ({ page }) => {
  await page.goto('/#postopki');
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('KP-0001');
  await rows.nth(1).click();
  if (test.info().project.name === 'desktop') await page.getByRole('button',{name:'Premakni KP-0002 gor'}).click();
  // On phones the details cover the table; the same arrows are in the detail header.
  else { await page.getByRole('complementary',{name:'Podrobnosti postopka'}).getByRole('button',{name:'Premakni postopek gor'}).click(); await page.keyboard.press('Escape'); }
  await expect(rows.nth(0)).toContainText('KP-0002');
  await expect(rows.nth(0).locator('.order-number')).toHaveText('1');
  await expect(rows.nth(1)).toContainText('KP-0001');
  await expect(rows.nth(1).locator('.order-number')).toHaveText('2');
  if (test.info().project.name === 'desktop') {
    await rows.nth(0).dragTo(rows.nth(2),{targetPosition:{x:200,y:30}});
    await expect(rows.nth(2)).toContainText('KP-0002');
    await expect(rows.nth(2).locator('.order-number')).toHaveText('3');
  }
  await page.reload();
  await expect(rows.nth(0)).toContainText(test.info().project.name === 'desktop' ? 'KP-0001' : 'KP-0002');
  await page.getByRole('button',{name:'Informacije in verzije'}).click();
  await expect(page.getByRole('dialog')).toContainText('2.01');
});

test('several measurements are defined on the product and entered in the test', async ({ page }) => {
  await page.goto('/#izdelki');
  await page.getByRole('button',{name:'HTB8 100-302'}).click();
  await page.getByRole('button',{name:'Dodaj postopek',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox',{name:'Kontrolni postopek'}).selectOption({label:'KP-0162 · Skupni tok F1, F2, F3, N'});
  await page.getByRole('button',{name:'Nastavi povezavo'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Shrani povezavo'}).click();
  await expect(dialog.getByRole('alert')).toContainText('vsaj eno meritev');
  for (const [i, name] of [[1,'F1'],[2,'F2']] as const) {
    await dialog.getByRole('button',{name:'Dodaj meritev'}).click();
    await dialog.getByRole('textbox',{name:`Ime meritve ${i}`}).fill(name);
    await dialog.getByRole('textbox',{name:`Enota meritve ${i}`}).fill('A');
    await dialog.getByRole('spinbutton',{name:`Minimum meritve ${i}`}).fill('10');
    await dialog.getByRole('spinbutton',{name:`Maksimum meritve ${i}`}).fill('20');
  }
  await dialog.getByRole('button',{name:'Shrani povezavo'}).click();
  await expect(page.getByRole('row').filter({hasText:'Skupni tok F1'})).toContainText('2 meritev');
  await page.goto('/#kakovost');
  await page.getByRole('button',{name:'DEMO-2026-001',exact:true}).click();
  await page.getByRole('row').filter({hasText:'DEMO-HTB8-001'}).getByRole('button',{name:'Začni test'}).click();
  const wizard = page.getByRole('dialog');
  await wizard.getByRole('textbox',{name:'F1 (A)'}).fill('15');
  await wizard.getByRole('button',{name:'Naprej'}).click();
  await expect(wizard.getByRole('alert')).toContainText('F2');
  await wizard.getByRole('textbox',{name:'F2 (A)'}).fill('25');
  await wizard.getByRole('button',{name:'Naprej'}).click();
  await expect(wizard).toContainText('F1=15 A; F2=25 A');
  await expect(wizard).toContainText('neustrezne');
  await wizard.getByRole('button',{name:'Shrani test'}).click();
  await expect(wizard).toHaveCount(0);
});
