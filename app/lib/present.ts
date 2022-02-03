import Share from 'react-native-share';
import * as RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';
import vc from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { Platform } from 'react-native';

import type { VerifiablePresentation } from '../types/presentation';
import type { CredentialRecordRaw } from '../model/credential';
import type { DidRecordRaw } from '../model/did';
import type { Credential } from '../types/credential';
import { toQr } from '../lib/decode';

import { securityLoader } from './documentLoader';

const documentLoader = securityLoader().build();

/**
 * This method wraps the create & sign presentation flow and and allows a
 * challenge to be specified. If the challenge paramater is not included,
 * a UUID will be generated and used in it's place.
 */
export async function createVerifiablePresentation(
  credentials: Credential[] = [],
  didRecord: DidRecordRaw,
  challenge = uuid.v4(),
): Promise<VerifiablePresentation> {
  const verificationKeyPair = await Ed25519VerificationKey2020.from(didRecord.verificationKey);
  const suite = new Ed25519Signature2020({ key: verificationKeyPair });

  const holder = didRecord.didDocument.id;
  const presentation = vc.createPresentation({ verifiableCredential: credentials, holder });

  const verifiablePresentation: VerifiablePresentation = await vc.signPresentation({
    presentation,
    suite,
    challenge,
    documentLoader,
  });

  return verifiablePresentation;
}

export async function sharePresentation(rawCredentialRecords: CredentialRecordRaw[], didRecord: DidRecordRaw): Promise<void> {
  const plurality = rawCredentialRecords.length > 1 ? 's' : '';
  const fileName = `SharedCredential${plurality}2`;
  const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}.txt`;
  const credentials = rawCredentialRecords.map(({ credential }) => credential);

  const verifiablePresentation = await createVerifiablePresentation(credentials, didRecord);

  if (await RNFS.exists(filePath)) {
    await RNFS.unlink(filePath);
  }

  // const verifiablePresentationString = JSON.stringify(verifiablePresentation, null, 2);
  const verifiablePresentationString = await toQr(verifiablePresentation);
  await RNFS.writeFile(filePath, verifiablePresentationString, 'utf8');

  /**
   * On Android, the clipboard share activity only supports strings (copying
   * the file URL if `message` is not provided). To support clipboard
   * functionality here, the `message` parameter must be supplied with the
   * stringified JSON of the file.
   *
   * On iOS, the clipboard supports file sharing so the `message` parameter
   * should be omitted. Including it would result in sharing both the file and
   * the JSON string.
   */
  Share.open({
    title: fileName,
    url: `file://${filePath}`,
    type: 'text/plain',
    subject: fileName,
    message: Platform.OS === 'ios' ? undefined : verifiablePresentationString,
  });
}
