import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

ed.hashes.sha512 = (...msgs) => sha512(ed.etc.concatBytes(...msgs))

globalThis.nobleEd25519 = {
  signAsync: (...args) => ed.signAsync(...args),
  verifyAsync: (...args) => ed.verifyAsync(...args),
  getPublicKeyAsync: (...args) => ed.getPublicKeyAsync(...args),
  etc: ed.etc,
}
