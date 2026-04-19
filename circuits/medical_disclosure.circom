pragma circom 2.1.6;

include "eddsaposeidon.circom";
include "poseidon.circom";
include "binary-merkle-root.circom";
include "babyjub.circom";
include "ecdh.circom";

template MedicalDisclosure(MAX_DEPTH) {
    // ---- Private inputs ----
    signal input indices[MAX_DEPTH];
    signal input merkleSiblings[MAX_DEPTH];
    signal input depth;
    signal input fieldKeyHash;
    signal input fieldValueHash;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;
    // Phase 5: ECDH ephemeral scalar + AES-key halves
    signal input ephemeralSk;
    signal input plaintext[2];

    // ---- Public inputs ----
    signal input merkleRoot;
    signal input pubKeyX;
    signal input pubKeyY;
    signal input pkBuyerX;
    signal input pkBuyerY;
    signal input ephemeralPkX;
    signal input ephemeralPkY;
    signal input ciphertext[2];
    signal input nonce;
    signal input aesKeyCommit;

    // ---- Merkle inclusion of the disclosed leaf ----
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== fieldKeyHash;
    leafHasher.inputs[1] <== fieldValueHash;

    component merkle = BinaryMerkleRoot(MAX_DEPTH);
    merkle.leaf <== leafHasher.out;
    merkle.depth <== depth;
    for (var i = 0; i < MAX_DEPTH; i++) {
        merkle.indices[i] <== indices[i];
        merkle.siblings[i] <== merkleSiblings[i];
    }
    merkleRoot === merkle.out;

    // ---- Medic EdDSA signature over the Merkle root ----
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== 1;
    eddsa.Ax <== pubKeyX;
    eddsa.Ay <== pubKeyY;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.S <== sigS;
    eddsa.M <== merkleRoot;

    // ---- Bind the AES-key halves to the per-listing aesKeyCommit.
    // aesKeyCommit = Poseidon(aesKey_hi, aesKey_lo) is stored on-chain in the
    // listing. The proof binds the delivered key to THIS listing's key, so
    // each sale of the same record can use a fresh AES key (no cross-buyer
    // key reuse) while leaving the medic signature untouched. ----
    component aesBind = Poseidon(2);
    aesBind.inputs[0] <== plaintext[0];
    aesBind.inputs[1] <== plaintext[1];
    aesBind.out === aesKeyCommit;

    // ---- Derive ephemeral pk = ephemeralSk · G ----
    component ephPk = BabyPbk();
    ephPk.in <== ephemeralSk;
    ephPk.Ax === ephemeralPkX;
    ephPk.Ay === ephemeralPkY;

    // ---- ECDH shared secret = ephemeralSk · pkBuyer ----
    component ecdh = Ecdh();
    ecdh.privateKey <== ephemeralSk;
    ecdh.publicKey[0] <== pkBuyerX;
    ecdh.publicKey[1] <== pkBuyerY;

    // ---- Poseidon stream cipher: pad[i] = Poseidon(sharedX, sharedY, nonce, i).
    // ciphertext[i] = plaintext[i] + pad[i]  (field addition).
    // Secure as a one-time-pad: nonce = orderId is never reused with the
    // same ephemeralSk (fresh per proof), so (shared, nonce) is unique. ----
    component pad0 = Poseidon(4);
    pad0.inputs[0] <== ecdh.sharedKey[0];
    pad0.inputs[1] <== ecdh.sharedKey[1];
    pad0.inputs[2] <== nonce;
    pad0.inputs[3] <== 0;

    component pad1 = Poseidon(4);
    pad1.inputs[0] <== ecdh.sharedKey[0];
    pad1.inputs[1] <== ecdh.sharedKey[1];
    pad1.inputs[2] <== nonce;
    pad1.inputs[3] <== 1;

    ciphertext[0] === plaintext[0] + pad0.out;
    ciphertext[1] === plaintext[1] + pad1.out;
}

component main { public [
    merkleRoot,
    pubKeyX, pubKeyY,
    pkBuyerX, pkBuyerY,
    ephemeralPkX, ephemeralPkY,
    ciphertext,
    nonce,
    aesKeyCommit
] } = MedicalDisclosure(8);
