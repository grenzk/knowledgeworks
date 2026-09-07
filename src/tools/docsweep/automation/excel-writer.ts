import ExcelJS from 'exceljs'
import type { DocSweepDocument } from './excel-reader.ts'

export type DocSweepSiteName = 'Vertiv' | 'Asset Library' | 'PD Cloud' | 'MASW'

const MASW_COLUMN = 5
const VERTIV_COLUMN = 6
const ASSET_LIBRARY_COLUMN = 7
const PD_CLOUD_COLUMN = 8

export async function saveExcelResults(
  sourceFilePath: string,
  documents: DocSweepDocument[],
  enabledSites: DocSweepSiteName[],
  outputFilePath = sourceFilePath,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()

  await workbook.xlsx.readFile(sourceFilePath)

  if (workbook.worksheets.length === 0) {
    throw new Error('The Excel workbook does not contain any worksheets.')
  }

  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    throw new Error('Unable to determine the worksheet.')
  }

  for (const document of documents) {
    if (enabledSites.includes('MASW')) {
      worksheet.getCell(document.row, MASW_COLUMN).value = document.masw
    }

    if (enabledSites.includes('Vertiv')) {
      worksheet.getCell(document.row, VERTIV_COLUMN).value = document.vertiv
    }

    if (enabledSites.includes('Asset Library')) {
      worksheet.getCell(document.row, ASSET_LIBRARY_COLUMN).value = document.assetLibrary
    }

    if (enabledSites.includes('PD Cloud')) {
      worksheet.getCell(document.row, PD_CLOUD_COLUMN).value = document.pdCloud
    }
  }

  await workbook.xlsx.writeFile(outputFilePath)
}
