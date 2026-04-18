pragma circom 2.1.6;

include "eddsaposeidon.circom";
include "poseidon.circom";
include "binary-merkle-root.circom";

template MedicalDisclosure(MAX_DEPTH) {
    // Private
    signal input indices[MAX_DEPTH];
    signal input merkleSiblings[MAX_DEPTH];
    signal input depth;
    signal input fieldKeyHash;
    signal input fieldValueHash;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // Public — pubSignals[0..2] in Solidity
    signal input merkleRoot;
    signal input pubKeyX;
    signal input pubKeyY;

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

    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== 1;
    eddsa.Ax <== pubKeyX;
    eddsa.Ay <== pubKeyY;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.S <== sigS;
    eddsa.M <== merkleRoot;
}

component main { public [merkleRoot, pubKeyX, pubKeyY] } = MedicalDisclosure(8);
