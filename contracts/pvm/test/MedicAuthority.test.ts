import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("MedicAuthority", function () {
	async function deployFixture() {
		const [authority1, authority2, authority3, nonAuthority, medic] =
			await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		const contract = await hre.viem.deployContract("MedicAuthority", [
			[authority1.account.address, authority2.account.address, authority3.account.address],
		]);

		return { contract, authority1, authority2, authority3, nonAuthority, medic, publicClient };
	}

	async function deploySingleAuthorityFixture() {
		const [authority1, nonAuthority, medic] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		const contract = await hre.viem.deployContract("MedicAuthority", [
			[authority1.account.address],
		]);

		return { contract, authority1, nonAuthority, medic, publicClient };
	}

	// ─── Constructor ──────────────────────────────────────────────────────────

	describe("Constructor", function () {
		it("rejects an empty initial authorities array", async function () {
			try {
				await hre.viem.deployContract("MedicAuthority", [[]]);
				expect.fail("Should have reverted with empty initial authorities");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("empty initial authorities");
			}
		});

		it("rejects a zero address in the initial list", async function () {
			const [authority1] = await hre.viem.getWalletClients();
			const zeroAddress = "0x0000000000000000000000000000000000000000";

			try {
				await hre.viem.deployContract("MedicAuthority", [
					[authority1.account.address, zeroAddress],
				]);
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("rejects duplicate addresses in the initial list", async function () {
			const [authority1] = await hre.viem.getWalletClients();

			try {
				await hre.viem.deployContract("MedicAuthority", [
					[authority1.account.address, authority1.account.address],
				]);
				expect.fail("Should have reverted with duplicate authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("duplicate authority");
			}
		});

		it("registers all initial authorities and sets authorityCount", async function () {
			const { contract, authority1, authority2, authority3 } =
				await loadFixture(deployFixture);

			expect(await contract.read.isAuthority([authority1.account.address])).to.equal(true);
			expect(await contract.read.isAuthority([authority2.account.address])).to.equal(true);
			expect(await contract.read.isAuthority([authority3.account.address])).to.equal(true);
			expect(await contract.read.authorityCount()).to.equal(3n);
		});
	});

	// ─── onlyAuthority gate ───────────────────────────────────────────────────

	describe("onlyAuthority gate", function () {
		it("addMedic reverts for non-authority caller", async function () {
			const { contract, nonAuthority, medic } = await loadFixture(deployFixture);

			try {
				await contract.write.addMedic([medic.account.address], {
					account: nonAuthority.account,
				});
				expect.fail("Should have reverted with not authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not authority");
			}
		});

		it("removeMedic reverts for non-authority caller", async function () {
			const { contract, authority1, nonAuthority, medic } = await loadFixture(deployFixture);

			// First add the medic as authority so we can test remove
			await contract.write.addMedic([medic.account.address], {
				account: authority1.account,
			});

			try {
				await contract.write.removeMedic([medic.account.address], {
					account: nonAuthority.account,
				});
				expect.fail("Should have reverted with not authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not authority");
			}
		});

		it("addAuthority reverts for non-authority caller", async function () {
			const { contract, nonAuthority } = await loadFixture(deployFixture);

			try {
				await contract.write.addAuthority([nonAuthority.account.address], {
					account: nonAuthority.account,
				});
				expect.fail("Should have reverted with not authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not authority");
			}
		});

		it("removeAuthority reverts for non-authority caller", async function () {
			const { contract, authority1, nonAuthority } = await loadFixture(deployFixture);

			try {
				await contract.write.removeAuthority([authority1.account.address], {
					account: nonAuthority.account,
				});
				expect.fail("Should have reverted with not authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not authority");
			}
		});
	});

	// ─── addMedic / removeMedic ───────────────────────────────────────────────

	describe("addMedic", function () {
		it("happy path: marks medic as verified and emits MedicAdded", async function () {
			const { contract, authority1, medic, publicClient } = await loadFixture(deployFixture);

			const hash = await contract.write.addMedic([medic.account.address], {
				account: authority1.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isVerifiedMedic([medic.account.address])).to.equal(true);

			const events = await contract.getEvents.MedicAdded();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.medic?.toLowerCase()).to.equal(
				medic.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(
				authority1.account.address.toLowerCase(),
			);
		});

		it("rejects zero address", async function () {
			const { contract, authority1 } = await loadFixture(deployFixture);
			const zeroAddress = "0x0000000000000000000000000000000000000000";

			try {
				await contract.write.addMedic([zeroAddress], { account: authority1.account });
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("rejects adding the same medic twice", async function () {
			const { contract, authority1, medic } = await loadFixture(deployFixture);

			await contract.write.addMedic([medic.account.address], {
				account: authority1.account,
			});

			try {
				await contract.write.addMedic([medic.account.address], {
					account: authority1.account,
				});
				expect.fail("Should have reverted with already verified medic");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("already verified medic");
			}
		});
	});

	describe("removeMedic", function () {
		async function deployWithMedic() {
			const ctx = await deployFixture();
			const { contract, authority1, medic } = ctx;
			await contract.write.addMedic([medic.account.address], {
				account: authority1.account,
			});
			return ctx;
		}

		it("happy path: unmarks medic and emits MedicRemoved", async function () {
			const { contract, authority1, medic, publicClient } =
				await loadFixture(deployWithMedic);

			const hash = await contract.write.removeMedic([medic.account.address], {
				account: authority1.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isVerifiedMedic([medic.account.address])).to.equal(false);

			const events = await contract.getEvents.MedicRemoved();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.medic?.toLowerCase()).to.equal(
				medic.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(
				authority1.account.address.toLowerCase(),
			);
		});

		it("rejects removing an address that is not a verified medic", async function () {
			const { contract, authority1, nonAuthority } = await loadFixture(deployFixture);

			try {
				await contract.write.removeMedic([nonAuthority.account.address], {
					account: authority1.account,
				});
				expect.fail("Should have reverted with not a verified medic");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not a verified medic");
			}
		});
	});

	// ─── addAuthority ─────────────────────────────────────────────────────────

	describe("addAuthority", function () {
		it("happy path: grants authority status, increments authorityCount, emits AuthorityAdded", async function () {
			const { contract, authority1, nonAuthority, publicClient } =
				await loadFixture(deployFixture);

			const countBefore = await contract.read.authorityCount();

			const hash = await contract.write.addAuthority([nonAuthority.account.address], {
				account: authority1.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isAuthority([nonAuthority.account.address])).to.equal(true);
			expect(await contract.read.authorityCount()).to.equal(countBefore + 1n);

			const events = await contract.getEvents.AuthorityAdded();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.authority?.toLowerCase()).to.equal(
				nonAuthority.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(
				authority1.account.address.toLowerCase(),
			);
		});

		it("rejects zero address", async function () {
			const { contract, authority1 } = await loadFixture(deployFixture);
			const zeroAddress = "0x0000000000000000000000000000000000000000";

			try {
				await contract.write.addAuthority([zeroAddress], { account: authority1.account });
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("rejects adding an address that is already an authority", async function () {
			const { contract, authority1, authority2 } = await loadFixture(deployFixture);

			try {
				await contract.write.addAuthority([authority2.account.address], {
					account: authority1.account,
				});
				expect.fail("Should have reverted with already an authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("already an authority");
			}
		});
	});

	// ─── removeAuthority ──────────────────────────────────────────────────────

	describe("removeAuthority", function () {
		it("happy path: revokes authority status, decrements authorityCount, emits AuthorityRemoved", async function () {
			const { contract, authority1, authority2, publicClient } =
				await loadFixture(deployFixture);

			const countBefore = await contract.read.authorityCount();

			const hash = await contract.write.removeAuthority([authority2.account.address], {
				account: authority1.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isAuthority([authority2.account.address])).to.equal(false);
			expect(await contract.read.authorityCount()).to.equal(countBefore - 1n);

			const events = await contract.getEvents.AuthorityRemoved();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.authority?.toLowerCase()).to.equal(
				authority2.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(
				authority1.account.address.toLowerCase(),
			);
		});

		it("can reduce from 3 authorities to 2, then to 1", async function () {
			const { contract, authority1, authority2, authority3 } =
				await loadFixture(deployFixture);

			await contract.write.removeAuthority([authority3.account.address], {
				account: authority1.account,
			});
			expect(await contract.read.authorityCount()).to.equal(2n);

			await contract.write.removeAuthority([authority2.account.address], {
				account: authority1.account,
			});
			expect(await contract.read.authorityCount()).to.equal(1n);
			expect(await contract.read.isAuthority([authority1.account.address])).to.equal(true);
		});

		it("reverts when attempting to remove the last authority", async function () {
			const { contract, authority1 } = await loadFixture(deploySingleAuthorityFixture);

			try {
				await contract.write.removeAuthority([authority1.account.address], {
					account: authority1.account,
				});
				expect.fail("Should have reverted with cannot remove last authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("cannot remove last authority");
			}
		});

		it("rejects removing an address that is not an authority", async function () {
			const { contract, authority1, nonAuthority } = await loadFixture(deployFixture);

			try {
				await contract.write.removeAuthority([nonAuthority.account.address], {
					account: authority1.account,
				});
				expect.fail("Should have reverted with not an authority");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not an authority");
			}
		});
	});
});
