import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("MedicAuthority", function () {
	async function deployFixture() {
		const [owner, nonOwner, medic, newOwner] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		const contract = await hre.viem.deployContract("MedicAuthority", [owner.account.address]);

		return { contract, owner, nonOwner, medic, newOwner, publicClient };
	}

	// ─── Constructor ──────────────────────────────────────────────────────────

	describe("Constructor", function () {
		it("rejects zero address as initial owner", async function () {
			const zeroAddress = "0x0000000000000000000000000000000000000000";
			try {
				await hre.viem.deployContract("MedicAuthority", [zeroAddress]);
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("sets owner correctly", async function () {
			const { contract, owner } = await loadFixture(deployFixture);
			expect((await contract.read.owner()).toLowerCase()).to.equal(
				owner.account.address.toLowerCase(),
			);
		});

		it("emits OwnershipTransferred(address(0), initialOwner)", async function () {
			const { contract, owner } = await loadFixture(deployFixture);
			const events = await contract.getEvents.OwnershipTransferred();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.previousOwner).to.equal(
				"0x0000000000000000000000000000000000000000",
			);
			expect(events[0].args.newOwner?.toLowerCase()).to.equal(
				owner.account.address.toLowerCase(),
			);
		});
	});

	// ─── onlyOwner gate ───────────────────────────────────────────────────────

	describe("onlyOwner gate", function () {
		it("addMedic reverts for non-owner", async function () {
			const { contract, nonOwner, medic } = await loadFixture(deployFixture);
			try {
				await contract.write.addMedic([medic.account.address], {
					account: nonOwner.account,
				});
				expect.fail("Should have reverted with not owner");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not owner");
			}
		});

		it("removeMedic reverts for non-owner", async function () {
			const { contract, owner, nonOwner, medic } = await loadFixture(deployFixture);
			await contract.write.addMedic([medic.account.address], { account: owner.account });
			try {
				await contract.write.removeMedic([medic.account.address], {
					account: nonOwner.account,
				});
				expect.fail("Should have reverted with not owner");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not owner");
			}
		});

		it("transferOwnership reverts for non-owner", async function () {
			const { contract, nonOwner, newOwner } = await loadFixture(deployFixture);
			try {
				await contract.write.transferOwnership([newOwner.account.address], {
					account: nonOwner.account,
				});
				expect.fail("Should have reverted with not owner");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not owner");
			}
		});
	});

	// ─── addMedic / removeMedic ───────────────────────────────────────────────

	describe("addMedic", function () {
		it("happy path: marks medic as verified and emits MedicAdded", async function () {
			const { contract, owner, medic, publicClient } = await loadFixture(deployFixture);

			const hash = await contract.write.addMedic([medic.account.address], {
				account: owner.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isVerifiedMedic([medic.account.address])).to.equal(true);

			const events = await contract.getEvents.MedicAdded();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.medic?.toLowerCase()).to.equal(
				medic.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(owner.account.address.toLowerCase());
		});

		it("rejects zero address", async function () {
			const { contract, owner } = await loadFixture(deployFixture);
			const zeroAddress = "0x0000000000000000000000000000000000000000";
			try {
				await contract.write.addMedic([zeroAddress], { account: owner.account });
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("rejects adding the same medic twice", async function () {
			const { contract, owner, medic } = await loadFixture(deployFixture);
			await contract.write.addMedic([medic.account.address], { account: owner.account });
			try {
				await contract.write.addMedic([medic.account.address], { account: owner.account });
				expect.fail("Should have reverted with already verified medic");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("already verified medic");
			}
		});
	});

	describe("removeMedic", function () {
		async function deployWithMedic() {
			const ctx = await deployFixture();
			await ctx.contract.write.addMedic([ctx.medic.account.address], {
				account: ctx.owner.account,
			});
			return ctx;
		}

		it("happy path: unmarks medic and emits MedicRemoved", async function () {
			const { contract, owner, medic, publicClient } = await loadFixture(deployWithMedic);

			const hash = await contract.write.removeMedic([medic.account.address], {
				account: owner.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect(await contract.read.isVerifiedMedic([medic.account.address])).to.equal(false);

			const events = await contract.getEvents.MedicRemoved();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.medic?.toLowerCase()).to.equal(
				medic.account.address.toLowerCase(),
			);
			expect(events[0].args.by?.toLowerCase()).to.equal(owner.account.address.toLowerCase());
		});

		it("rejects removing an address that is not a verified medic", async function () {
			const { contract, owner, nonOwner } = await loadFixture(deployFixture);
			try {
				await contract.write.removeMedic([nonOwner.account.address], {
					account: owner.account,
				});
				expect.fail("Should have reverted with not a verified medic");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not a verified medic");
			}
		});
	});

	// ─── transferOwnership ────────────────────────────────────────────────────

	describe("transferOwnership", function () {
		it("happy path: updates owner and emits OwnershipTransferred", async function () {
			const { contract, owner, newOwner, publicClient } = await loadFixture(deployFixture);

			const hash = await contract.write.transferOwnership([newOwner.account.address], {
				account: owner.account,
			});
			await publicClient.waitForTransactionReceipt({ hash });

			expect((await contract.read.owner()).toLowerCase()).to.equal(
				newOwner.account.address.toLowerCase(),
			);

			const events = await contract.getEvents.OwnershipTransferred();
			expect(events).to.have.lengthOf(1);
			expect(events[0].args.previousOwner?.toLowerCase()).to.equal(
				owner.account.address.toLowerCase(),
			);
			expect(events[0].args.newOwner?.toLowerCase()).to.equal(
				newOwner.account.address.toLowerCase(),
			);
		});

		it("rejects zero address as new owner", async function () {
			const { contract, owner } = await loadFixture(deployFixture);
			const zeroAddress = "0x0000000000000000000000000000000000000000";
			try {
				await contract.write.transferOwnership([zeroAddress], { account: owner.account });
				expect.fail("Should have reverted with zero address not allowed");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("zero address not allowed");
			}
		});

		it("new owner can immediately call addMedic after transfer", async function () {
			const { contract, owner, newOwner, medic } = await loadFixture(deployFixture);

			await contract.write.transferOwnership([newOwner.account.address], {
				account: owner.account,
			});
			await contract.write.addMedic([medic.account.address], { account: newOwner.account });

			expect(await contract.read.isVerifiedMedic([medic.account.address])).to.equal(true);
		});

		it("previous owner loses access after transfer", async function () {
			const { contract, owner, newOwner, medic } = await loadFixture(deployFixture);

			await contract.write.transferOwnership([newOwner.account.address], {
				account: owner.account,
			});

			try {
				await contract.write.addMedic([medic.account.address], { account: owner.account });
				expect.fail("Should have reverted with not owner");
			} catch (e: unknown) {
				expect((e as Error).message).to.include("not owner");
			}
		});
	});
});
