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

test('procedures can be edited, hidden and restored without deleting data', async ({ page }) => {
  await page.goto('/#postopki');
  await expect(page.getByRole('heading',{name:'Definicija kontrolnih postopkov',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nov postopek'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox',{name:'Naziv postopka'}).fill('E2E kontrola površine');
  await dialog.getByRole('textbox',{name:'Navodilo za izvajalca'}).fill('Preglej površino izdelka.');
  await dialog.getByRole('button',{name:'Shrani postopek'}).click();
  const row = page.getByRole('row').filter({hasText:'E2E kontrola površine'});
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:'Skrij KP-0011'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Skrij postopek',exact:true}).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Prikaži skrite'}).check();
  await expect(row).toContainText('Skrit');
  await row.getByRole('button',{name:'Obnovi KP-0011'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Obnovi postopek',exact:true}).click();
  await expect(row).toContainText('Aktiven');
  await page.reload();
  await expect(row).toBeVisible();
  await page.screenshot({path:`test-results/procedures-${test.info().project.name}.png`,fullPage:true});
});

test('product association supports per-product instructions and persists', async ({ page }) => {
  await page.goto('/#izdelki');
  await page.getByRole('button',{name:'HTB8 100-302'}).click();
  await page.getByRole('button',{name:'Dodaj postopek',exact:true}).click();
  await page.getByRole('dialog').getByRole('combobox',{name:'Kontrolni postopek'}).selectOption({label:'KP-0007 · Napetost varovalk'});
  await page.getByRole('button',{name:'Nastavi povezavo'}).click();
  const dialog = page.getByRole('dialog');
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
