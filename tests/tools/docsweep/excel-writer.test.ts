import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { saveExcelResults } from '../../../src/tools/docsweep/automation/excel-writer.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('saveExcelResults', () => {
  it('updates enabled sites without replacing disabled site data', async () => {
    const sourceFilePath = await createWorkbook()

    await saveExcelResults(sourceFilePath, [createSweepDocument()], ['MASW', 'Vertiv'])

    await expect(readSiteValues(sourceFilePath)).resolves.toEqual({
      masw: 'New MASW',
      vertiv: 'New Vertiv',
      assetLibrary: 'Existing Asset Library',
      pdCloud: 'Existing PD Cloud',
    })
  })

  it('preserves disabled site data when saving to another workbook', async () => {
    const sourceFilePath = await createWorkbook()
    const outputFilePath = join(temporaryDirectories[0], 'DocSweep Results.xlsx')

    await saveExcelResults(sourceFilePath, [createSweepDocument()], ['Asset Library'], outputFilePath)

    await expect(readSiteValues(outputFilePath)).resolves.toEqual({
      masw: 'Existing MASW',
      vertiv: 'Existing Vertiv',
      assetLibrary: 'New Asset Library',
      pdCloud: 'Existing PD Cloud',
    })
    await expect(readSiteValues(sourceFilePath)).resolves.toEqual({
      masw: 'Existing MASW',
      vertiv: 'Existing Vertiv',
      assetLibrary: 'Existing Asset Library',
      pdCloud: 'Existing PD Cloud',
    })
  })
})

async function createWorkbook(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'docsweep-'))
  const filePath = join(directory, 'Documents.xlsx')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Documents')

  temporaryDirectories.push(directory)
  worksheet.getCell(2, 5).value = 'Existing MASW'
  worksheet.getCell(2, 6).value = 'Existing Vertiv'
  worksheet.getCell(2, 7).value = 'Existing Asset Library'
  worksheet.getCell(2, 8).value = 'Existing PD Cloud'
  await workbook.xlsx.writeFile(filePath)

  return filePath
}

function createSweepDocument() {
  return {
    row: 2,
    controlNumber: '123456',
    masw: 'New MASW',
    vertiv: 'New Vertiv',
    assetLibrary: 'New Asset Library',
    pdCloud: 'New PD Cloud',
  }
}

async function readSiteValues(filePath: string) {
  const workbook = new ExcelJS.Workbook()

  await workbook.xlsx.readFile(filePath)

  const worksheet = workbook.worksheets[0]

  return {
    masw: worksheet?.getCell(2, 5).value,
    vertiv: worksheet?.getCell(2, 6).value,
    assetLibrary: worksheet?.getCell(2, 7).value,
    pdCloud: worksheet?.getCell(2, 8).value,
  }
}
