import { MedplumClient } from '@medplum/core';
import { BundleEntry, ExplanationOfBenefit, ExplanationOfBenefitItem, Resource } from '@medplum/fhirtypes';
import { Command } from 'commander';
import { createReadStream, writeFile,promises as fsPromises } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { getUnsupportedExtension, prettyPrint } from './utils';


const bulkExportCommand = createMedplumCommand('export');
const bulkImportCommand = createMedplumCommand('import');

export const bulk = new Command('bulk').addCommand(bulkExportCommand).addCommand(bulkImportCommand);

bulkExportCommand
  .option(
    '-e, --export-level <exportLevel>',
    'Optional export level. Defaults to system level export. "Group/:id" - Group of Patients, "Patient" - All Patients.'
  )
  .option('-t, --types <types>', 'optional resource types to export')
  .option(
    '-s, --since <since>',
    'optional Resources will be included in the response if their state has changed after the supplied time (e.g. if Resource.meta.lastUpdated is later than the supplied _since time).'
  )
  .option(
    '-d, --target-directory <targetDirectory>',
    'optional target directory to save files from the bulk export operations.'
  )
  .action(async (options) => {
    const { exportLevel, types, since, targetDirectory } = options;
    const medplum = await createMedplumClient(options);
    const response = await medplum.bulkExport(exportLevel, types, since);

    response.output?.forEach(async ({ type, url }) => {
      const fileUrl = new URL(url as string);
      const data = await medplum.download(url as string);
      const fileName = `${type}_${fileUrl.pathname}`.replace(/[^a-zA-Z0-9]+/g, '_') + '.ndjson';
      const path = resolve(targetDirectory ?? '', fileName);

      writeFile(`${path}`, await data.text(), () => {
        console.log(`${path} is created`);
      });
    });
  });

  bulkImportCommand
  .argument('[filenameOrDirectory]', 'Mandatory argument, either File Name or Directory containing NDJSON files')
  .option(
    '--is-directory',
    'Flag to indicate if the argument is a directory containing NDJSON files',
    false
  )
  .option(
    '--num-resources-per-request <numResourcesPerRequest>',
    'optional number of resources to import per batch request. Defaults to 25.',
    '25'
  )
  .option(
    '--add-extensions-for-missing-values',
    'optional flag to add extensions for missing values in a resource',
    false
  )
  .option('-d, --target-directory <targetDirectory>', 'optional target directory of file to be imported')
  .action(async (fileNameOrDirectory, options) => {
    const { numResourcesPerRequest, addExtensionsForMissingValues, targetDirectory, isDirectory } = options;
    
    // Determine the full path based on whether --is-directory is specified
    let fullPath;
    if (isDirectory) {
      if (!targetDirectory) {
        console.error('Error: --target-directory must be specified when using --is-directory.');
        return;
      }
      fullPath = targetDirectory;
    } else {
      if (!fileNameOrDirectory) {
        console.error('Error: filenameOrDirectory must be specified when not using --is-directory.');
        return;
      }
      fullPath = resolve(targetDirectory ?? process.cwd(), fileNameOrDirectory);
    }
    const medplum = await createMedplumClient(options);

    if (isDirectory) {
      if (!fullPath) {
        console.error('Error: --target-directory must be specified when using --is-directory.');
        return;
      }
      const files = await fsPromises.readdir(fullPath);
      const ndjsonFiles = files.filter(file => file.endsWith('.ndjson'));
      
      for (const ndjsonFile of ndjsonFiles) {
        const filePath = resolve(fullPath, ndjsonFile);
        await importFile(filePath, parseInt(numResourcesPerRequest, 10), medplum, addExtensionsForMissingValues);
      }
    } else {
      await importFile(fullPath, parseInt(numResourcesPerRequest, 10), medplum, addExtensionsForMissingValues);
    }
});


async function importFile(
  path: string,
  numResourcesPerRequest: number,
  medplum: MedplumClient,
  addExtensionsForMissingValues: boolean
): Promise<void> {
  let entries = [] as BundleEntry[];
  const fileStream = createReadStream(path);
  const rl = createInterface({
    input: fileStream,
  });

  for await (const line of rl) {
    const resource = parseResource(line, addExtensionsForMissingValues);
    entries.push({
      resource: resource,
      request: {
        method: 'POST',
        url: resource.resourceType,
      },
    });
    if (entries.length % numResourcesPerRequest === 0) {
      await sendBatchEntries(entries, medplum);
      entries = [];
    }
  }
  if (entries.length > 0) {
    await sendBatchEntries(entries, medplum);
  }
}

async function sendBatchEntries(entries: BundleEntry[], medplum: MedplumClient): Promise<void> {
  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  });

  result.entry?.forEach((resultEntry) => {
    prettyPrint(resultEntry.response);
  });
}

function parseResource(jsonString: string, addExtensionsForMissingValues: boolean): Resource {
  const resource = JSON.parse(jsonString);

  if (addExtensionsForMissingValues) {
    return addExtensionsForMissingValuesResource(resource);
  }

  return resource;
}

function addExtensionsForMissingValuesResource(resource: Resource): Resource {
  if (resource.resourceType === 'ExplanationOfBenefit') {
    return addExtensionsForMissingValuesExplanationOfBenefits(resource);
  }
  return resource;
}

function addExtensionsForMissingValuesExplanationOfBenefits(resource: ExplanationOfBenefit): ExplanationOfBenefit {
  if (!resource.provider) {
    resource.provider = getUnsupportedExtension();
  }

  resource.item?.forEach((item: ExplanationOfBenefitItem) => {
    if (!item?.productOrService) {
      item.productOrService = getUnsupportedExtension();
    }
  });

  return resource;
}
