import {
	StorageDescriptor,
	PlainDescriptor,
	TxDescriptor,
	RuntimeDescriptor,
	Enum,
	ApisFromDef,
	QueryFromPalletsDef,
	TxFromPalletsDef,
	EventsFromPalletsDef,
	ErrorsFromPalletsDef,
	ConstFromPalletsDef,
	ViewFnsFromPalletsDef,
	SS58String,
	FixedSizeBinary,
	Binary,
	FixedSizeArray,
} from "polkadot-api";
import {
	I5sesotjlssv2d,
	Iffmde3ekjedi9,
	I4mddgoa69c0a2,
	I6rcro8alcqots,
	I95g6i7ilua7lq,
	Ieniouoqkq4icf,
	Phase,
	Ibgl04rn6nbfm6,
	I4q39t5hn830vp,
	I1v7jbnil3tjns,
	I8jgj1nhcr2dg8,
	Ifn6q3equiq9qi,
	Ia3sb0vgvovhtg,
	Iav8k1edbj86k7,
	Itom7fk49o0c9,
	I4i91h98n3cv1b,
	I4iumukclgj8ej,
	Iqnbvitf7a7l3,
	I48i407regf59r,
	I6r5cbv8ttrb09,
	I1q8tnt1cluu5j,
	I8ds64oj6581v0,
	Ia7pdug7cdsg8g,
	I63lqt6dl3kn9k,
	I9bin2jc70qt6q,
	TransactionPaymentReleases,
	Iag146hmjgqfgj,
	I8uo3fpd3bcc6f,
	Ia2lhg7l2hilo3,
	Ifi4da1gej1fri,
	Ifvgo9568rpmqc,
	I82jm9g7pufuel,
	Ic5m5lp1oioo8r,
	I6cs1itejju2vv,
	Icgljjb6j82uhn,
	Ib77b0fp1a6mjr,
	I5g2vv0ckl2m8b,
	Ifup3lg9ro8a0f,
	I5qfubnuvrnqn6,
	I8t3u2dv73ahbd,
	I7vlvrrl2pnbgk,
	Ie0rpl5bahldfk,
	XcmPalletVersionMigrationStage,
	I7e5oaj2qi4kl1,
	Ie849h3gncgvok,
	Iat62vud7hlod2,
	Ict03eedr8de9s,
	Ici7ejds60vj52,
	XcmVersionedLocation,
	Idh2ug6ou4a8og,
	Iejeo53sea6n4q,
	I53esa2ms463bk,
	Ib4jhb8tt3uung,
	I7offqqltf3agj,
	I834nfrf667ag1,
	I14i9pui8lc778,
	I8t4pajubp34g3,
	I10nrsmn0hji4l,
	I3oiqcurom3m43,
	I20ichc5j0l1u7,
	I1p16diuhde12h,
	Id4f5q01qh34o3,
	In7a38730s6qs,
	If15el53dd76v9,
	I9s0ave7t0vnrk,
	I4fo08joqmcqnm,
	XcmV5Junctions,
	Iasb8k6ash5mjn,
	I8ofcg5rbj0g2c,
	I4adgbll7gku4i,
	I6pjjpfvhvcfru,
	I9pj91mj79qekl,
	I39uah9nss64h9,
	Ik64dknsq7k08,
	Ib51vk42m1po4n,
	Ial23jn8hp0aen,
	Ifpj261e8s63m3,
	Idcr6u6361oad9,
	I4ktuaksf5i1gk,
	I9bqtpv2ii35mp,
	I9j7pagd6d4bda,
	I2h9pmio37r7fb,
	Ibmr18suc9ikh9,
	I9iq22t0burs89,
	I5u8olqbbvfnvf,
	I5utcetro501ir,
	Iaalag4sajqdff,
	I8nd3h8unsth6v,
	I8k3rnvpeeh4hv,
	Ifup0v752q8jvh,
	I9dogfdq00v6br,
	Ie75pdmrsbc71n,
	Ideaemvoneh309,
	I3d9o9d7epp66v,
	I6lqh1vgb4mcja,
	Ifccifqltb5obi,
	Iadtsfv699cq8b,
	Ialpmgmhr3gk5r,
	I4cbvqmqadhrea,
	I3sdol54kg5jaq,
	I8fougodaj6di6,
	I81vt5eq60l4b6,
	I3vh014cqgmrfd,
	Ia5cotcvi888ln,
	I21jsa919m88fd,
	Iegif7m3upfe1k,
	I9kt8c221c83ln,
	Ic76kfh5ebqkpl,
	Icscpmubum33bq,
	I21d2olof7eb60,
	Ibgm4rnf22lal1,
	Ie68np0vpihith,
	I9bnv6lu0crf1q,
	Iauhjqifrdklq7,
	Ie1uso9m8rt5cf,
	I40pqum1mu8qg3,
	I1r4c2ghbtvjuc,
	I1jm8m1rh9e20v,
	Ida37oe44osb06,
	I6v02o6j4snahe,
	I27569neuh5t1o,
	Id92o6smntb9m5,
	I5nmb2hfkgk9ol,
	Iav55bcqlrqn51,
	I8rgbuguu0r385,
	I10ra4g1rl6k2f,
	I1uihehkdsggvp,
	Ia82mnkmeo2rhc,
	I1r3pbre2pbk42,
	Icbccs0ug47ilf,
	I855j4i3kr8ko1,
	I301j27dgc96v5,
	Idd7hd99u0ho0n,
	Iafscmv8tjf0ou,
	I100l07kaehdlp,
	I6gnbnvip5vvdi,
	Icv68aq8841478,
	Ic262ibdoec56a,
	Iflcfm9b6nlmdd,
	Ijrsf4mnp3eka,
	Id5fm4p8lj5qgi,
	I8tjvj9uq4b7hi,
	I3qt1hgg4djhgb,
	I4fooe9dun9o0t,
	I2sjgp7v0b4kr7,
	Iq8n5b8q00vqa,
	Iaa6lo6ksjs4p7,
	Iph9c4rn81ub2,
	Ier2cke86dqbr2,
	Iegiuu1igi1d3c,
	I5rtkmhm2dng4u,
	Iep27ialq4a7o7,
	Iasu5jvoqr43mv,
	I3uo4gtrvs4i80,
	I5qolde99acmd1,
	I8gtde5abn1g9a,
	I39t01nnod9109,
	I6v8sm60vvkmk7,
	I1qmtmbe5so8r3,
	Ih99m6ehpcar7,
	Idgorhsbgdq2ap,
	I9ubb2kqevnu6t,
	I2hq50pu2kdjpo,
	I9acqruh7322g2,
	I137t1cld92pod,
	I61d51nv4cou88,
	If8u5kl4h8070m,
	Ibmuil6p3vl83l,
	I7lul91g50ae87,
	Icl7nl1rfeog3i,
	Iasr6pj6shs0fl,
	I2uqmls7kcdnii,
	Idg69klialbkb8,
	I7r6b7145022pp,
	I30pg328m00nr3,
	Icmrn7bogp28cs,
	I7m9b5plj4h5ot,
	I9onhk772nfs4f,
	I3l6bnksrmt56r,
	Idh09k0l2pmdcg,
	I7uoiphbm0tj4r,
	I512p1n7qt24l8,
	I6s1nbislhk619,
	I3gghqnh2mj0is,
	I6iv852roh6t3h,
	I9oc2o6itbiopq,
	Ibslgga81p36aa,
	I1rvj4ubaplho0,
	Ia3uu7lqcc1q1i,
	I7crucfnonitkn,
	I7tmrp94r9sq4n,
	I3uua81e9uvgnp,
	I9p6tgcfbrrlod,
	I7svbvm6hg57aj,
	I8jhsbaiultviu,
	Idrmne02mqlgti,
	I5r8t4iaend96p,
	Iaqet9jc3ihboe,
	Ic952bubvq4k7d,
	I2v50gu3s1aqk6,
	Iabpgqcjikia83,
	I4gil44d08grh,
	I7u915mvkdsb08,
	I51fc7k1hjr1t8,
	If7uv525tdvv7a,
	I2an1fs2eiebjp,
	TransactionValidityTransactionSource,
	I9ask1o4tfvcvs,
	Icerf8h8pdu8ss,
	I6spmpef2c7svf,
	Iei2mvq0mjvt81,
	Ifeps06gn4308f,
	Ic1d4u2opv3fst,
	Ico18ks790i2bl,
	I815pbp5omtss,
	I3ju6ot8lfmk90,
	Ie9sr1iqcg3cgm,
	I1mqgk2tmnn9i2,
	I6lr8sctk0bi4e,
	I4totqt881mlti,
	I4s6vifaf8k998,
	I35p85j063s0il,
	I4ehfioavudv4i,
	I9sijb8gfrns29,
	I6be913iq796os,
	I6f9v7emp7t5ba,
	Ida7d8eqrkav55,
	Idmrtv8jbbitnu,
	Iabkm12ro9ocjb,
	I4auf8deg30s4e,
	I63nhnkgg114n5,
	I1l7ajs6s9ur3a,
	Ice9mpbhevl5b7,
	Idt5popft6i714,
	I512dtcl0pn07c,
	I9534japht9jdl,
} from "./common-types";
type AnonymousEnum<T extends {}> = T & {
	__anonymous: true;
};
type MyTuple<T> = [T, ...T[]];
type SeparateUndefined<T> = undefined extends T ? undefined | Exclude<T, undefined> : T;
type Anonymize<T> = SeparateUndefined<
	T extends FixedSizeBinary<infer L>
		? number extends L
			? Binary
			: FixedSizeBinary<L>
		: T extends
					| string
					| number
					| bigint
					| boolean
					| void
					| undefined
					| null
					| symbol
					| Uint8Array
					| Enum<any>
			? T
			: T extends AnonymousEnum<infer V>
				? Enum<V>
				: T extends MyTuple<any>
					? {
							[K in keyof T]: T[K];
						}
					: T extends []
						? []
						: T extends FixedSizeArray<infer L, infer T>
							? number extends L
								? Array<T>
								: FixedSizeArray<L, T>
							: {
									[K in keyof T & string]: T[K];
								}
>;
type IStorage = {
	System: {
		/**
		 * The full account information for a particular account ID.
		 */
		Account: StorageDescriptor<[Key: SS58String], Anonymize<I5sesotjlssv2d>, false, never>;
		/**
		 * Total extrinsics count for the current block.
		 */
		ExtrinsicCount: StorageDescriptor<[], number, true, never>;
		/**
		 * Whether all inherents have been applied.
		 */
		InherentsApplied: StorageDescriptor<[], boolean, false, never>;
		/**
		 * The current weight for the block.
		 */
		BlockWeight: StorageDescriptor<[], Anonymize<Iffmde3ekjedi9>, false, never>;
		/**
		 * Total length (in bytes) for all extrinsics put together, for the current block.
		 */
		AllExtrinsicsLen: StorageDescriptor<[], number, true, never>;
		/**
		 * Map of block numbers to block hashes.
		 */
		BlockHash: StorageDescriptor<[Key: number], FixedSizeBinary<32>, false, never>;
		/**
		 * Extrinsics data for the current block (maps an extrinsic's index to its data).
		 */
		ExtrinsicData: StorageDescriptor<[Key: number], Binary, false, never>;
		/**
		 * The current block number being processed. Set by `execute_block`.
		 */
		Number: StorageDescriptor<[], number, false, never>;
		/**
		 * Hash of the previous block.
		 */
		ParentHash: StorageDescriptor<[], FixedSizeBinary<32>, false, never>;
		/**
		 * Digest of the current block, also part of the block header.
		 */
		Digest: StorageDescriptor<[], Anonymize<I4mddgoa69c0a2>, false, never>;
		/**
		 * Events deposited for the current block.
		 *
		 * NOTE: The item is unbound and should therefore never be read on chain.
		 * It could otherwise inflate the PoV size of a block.
		 *
		 * Events have a large in-memory size. Box the events to not go out-of-memory
		 * just in case someone still reads them from within the runtime.
		 */
		Events: StorageDescriptor<[], Anonymize<I6rcro8alcqots>, false, never>;
		/**
		 * The number of events in the `Events<T>` list.
		 */
		EventCount: StorageDescriptor<[], number, false, never>;
		/**
		 * Mapping between a topic (represented by T::Hash) and a vector of indexes
		 * of events in the `<Events<T>>` list.
		 *
		 * All topic vectors have deterministic storage locations depending on the topic. This
		 * allows light-clients to leverage the changes trie storage tracking mechanism and
		 * in case of changes fetch the list of events of interest.
		 *
		 * The value has the type `(BlockNumberFor<T>, EventIndex)` because if we used only just
		 * the `EventIndex` then in case if the topic has the same contents on the next block
		 * no notification will be triggered thus the event might be lost.
		 */
		EventTopics: StorageDescriptor<
			[Key: FixedSizeBinary<32>],
			Anonymize<I95g6i7ilua7lq>,
			false,
			never
		>;
		/**
		 * Stores the `spec_version` and `spec_name` of when the last runtime upgrade happened.
		 */
		LastRuntimeUpgrade: StorageDescriptor<[], Anonymize<Ieniouoqkq4icf>, true, never>;
		/**
		 * True if we have upgraded so that `type RefCount` is `u32`. False (default) if not.
		 */
		UpgradedToU32RefCount: StorageDescriptor<[], boolean, false, never>;
		/**
		 * True if we have upgraded so that AccountInfo contains three types of `RefCount`. False
		 * (default) if not.
		 */
		UpgradedToTripleRefCount: StorageDescriptor<[], boolean, false, never>;
		/**
		 * The execution phase of the block.
		 */
		ExecutionPhase: StorageDescriptor<[], Phase, true, never>;
		/**
		 * `Some` if a code upgrade has been authorized.
		 */
		AuthorizedUpgrade: StorageDescriptor<[], Anonymize<Ibgl04rn6nbfm6>, true, never>;
		/**
		 * The weight reclaimed for the extrinsic.
		 *
		 * This information is available until the end of the extrinsic execution.
		 * More precisely this information is removed in `note_applied_extrinsic`.
		 *
		 * Logic doing some post dispatch weight reduction must update this storage to avoid duplicate
		 * reduction.
		 */
		ExtrinsicWeightReclaimed: StorageDescriptor<[], Anonymize<I4q39t5hn830vp>, false, never>;
	};
	ParachainSystem: {
		/**
		 * Latest included block descendants the runtime accepted. In other words, these are
		 * ancestors of the currently executing block which have not been included in the observed
		 * relay-chain state.
		 *
		 * The segment length is limited by the capacity returned from the [`ConsensusHook`] configured
		 * in the pallet.
		 */
		UnincludedSegment: StorageDescriptor<[], Anonymize<I1v7jbnil3tjns>, false, never>;
		/**
		 * Storage field that keeps track of bandwidth used by the unincluded segment along with the
		 * latest HRMP watermark. Used for limiting the acceptance of new blocks with
		 * respect to relay chain constraints.
		 */
		AggregatedUnincludedSegment: StorageDescriptor<[], Anonymize<I8jgj1nhcr2dg8>, true, never>;
		/**
		 * In case of a scheduled upgrade, this storage field contains the validation code to be
		 * applied.
		 *
		 * As soon as the relay chain gives us the go-ahead signal, we will overwrite the
		 * [`:code`][sp_core::storage::well_known_keys::CODE] which will result the next block process
		 * with the new validation code. This concludes the upgrade process.
		 */
		PendingValidationCode: StorageDescriptor<[], Binary, false, never>;
		/**
		 * Validation code that is set by the parachain and is to be communicated to collator and
		 * consequently the relay-chain.
		 *
		 * This will be cleared in `on_initialize` of each new block if no other pallet already set
		 * the value.
		 */
		NewValidationCode: StorageDescriptor<[], Binary, true, never>;
		/**
		 * The [`PersistedValidationData`] set for this block.
		 *
		 * This value is expected to be set only once by the [`Pallet::set_validation_data`] inherent.
		 */
		ValidationData: StorageDescriptor<[], Anonymize<Ifn6q3equiq9qi>, true, never>;
		/**
		 * Were the validation data set to notify the relay chain?
		 */
		DidSetValidationCode: StorageDescriptor<[], boolean, false, never>;
		/**
		 * The relay chain block number associated with the last parachain block.
		 *
		 * This is updated in `on_finalize`.
		 */
		LastRelayChainBlockNumber: StorageDescriptor<[], number, false, never>;
		/**
		 * An option which indicates if the relay-chain restricts signalling a validation code upgrade.
		 * In other words, if this is `Some` and [`NewValidationCode`] is `Some` then the produced
		 * candidate will be invalid.
		 *
		 * This storage item is a mirror of the corresponding value for the current parachain from the
		 * relay-chain. This value is ephemeral which means it doesn't hit the storage. This value is
		 * set after the inherent.
		 */
		UpgradeRestrictionSignal: StorageDescriptor<[], Anonymize<Ia3sb0vgvovhtg>, false, never>;
		/**
		 * Optional upgrade go-ahead signal from the relay-chain.
		 *
		 * This storage item is a mirror of the corresponding value for the current parachain from the
		 * relay-chain. This value is ephemeral which means it doesn't hit the storage. This value is
		 * set after the inherent.
		 */
		UpgradeGoAhead: StorageDescriptor<[], Anonymize<Iav8k1edbj86k7>, false, never>;
		/**
		 * The state proof for the last relay parent block.
		 *
		 * This field is meant to be updated each block with the validation data inherent. Therefore,
		 * before processing of the inherent, e.g. in `on_initialize` this data may be stale.
		 *
		 * This data is also absent from the genesis.
		 */
		RelayStateProof: StorageDescriptor<[], Anonymize<Itom7fk49o0c9>, true, never>;
		/**
		 * The snapshot of some state related to messaging relevant to the current parachain as per
		 * the relay parent.
		 *
		 * This field is meant to be updated each block with the validation data inherent. Therefore,
		 * before processing of the inherent, e.g. in `on_initialize` this data may be stale.
		 *
		 * This data is also absent from the genesis.
		 */
		RelevantMessagingState: StorageDescriptor<[], Anonymize<I4i91h98n3cv1b>, true, never>;
		/**
		 * The parachain host configuration that was obtained from the relay parent.
		 *
		 * This field is meant to be updated each block with the validation data inherent. Therefore,
		 * before processing of the inherent, e.g. in `on_initialize` this data may be stale.
		 *
		 * This data is also absent from the genesis.
		 */
		HostConfiguration: StorageDescriptor<[], Anonymize<I4iumukclgj8ej>, true, never>;
		/**
		 * The last downward message queue chain head we have observed.
		 *
		 * This value is loaded before and saved after processing inbound downward messages carried
		 * by the system inherent.
		 */
		LastDmqMqcHead: StorageDescriptor<[], FixedSizeBinary<32>, false, never>;
		/**
		 * The message queue chain heads we have observed per each channel incoming channel.
		 *
		 * This value is loaded before and saved after processing inbound downward messages carried
		 * by the system inherent.
		 */
		LastHrmpMqcHeads: StorageDescriptor<[], Anonymize<Iqnbvitf7a7l3>, false, never>;
		/**
		 * Number of downward messages processed in a block.
		 *
		 * This will be cleared in `on_initialize` of each new block.
		 */
		ProcessedDownwardMessages: StorageDescriptor<[], number, false, never>;
		/**
		 * The last processed downward message.
		 *
		 * We need to keep track of this to filter the messages that have been already processed.
		 */
		LastProcessedDownwardMessage: StorageDescriptor<[], Anonymize<I48i407regf59r>, true, never>;
		/**
		 * HRMP watermark that was set in a block.
		 */
		HrmpWatermark: StorageDescriptor<[], number, false, never>;
		/**
		 * The last processed HRMP message.
		 *
		 * We need to keep track of this to filter the messages that have been already processed.
		 */
		LastProcessedHrmpMessage: StorageDescriptor<[], Anonymize<I48i407regf59r>, true, never>;
		/**
		 * HRMP messages that were sent in a block.
		 *
		 * This will be cleared in `on_initialize` of each new block.
		 */
		HrmpOutboundMessages: StorageDescriptor<[], Anonymize<I6r5cbv8ttrb09>, false, never>;
		/**
		 * Upward messages that were sent in a block.
		 *
		 * This will be cleared in `on_initialize` for each new block.
		 */
		UpwardMessages: StorageDescriptor<[], Anonymize<Itom7fk49o0c9>, false, never>;
		/**
		 * Upward messages that are still pending and not yet sent to the relay chain.
		 */
		PendingUpwardMessages: StorageDescriptor<[], Anonymize<Itom7fk49o0c9>, false, never>;
		/**
		 * Upward signals that are still pending and not yet sent to the relay chain.
		 *
		 * This will be cleared in `on_finalize` for each block.
		 */
		PendingUpwardSignals: StorageDescriptor<[], Anonymize<Itom7fk49o0c9>, false, never>;
		/**
		 * The factor to multiply the base delivery fee by for UMP.
		 */
		UpwardDeliveryFeeFactor: StorageDescriptor<[], bigint, false, never>;
		/**
		 * The number of HRMP messages we observed in `on_initialize` and thus used that number for
		 * announcing the weight of `on_initialize` and `on_finalize`.
		 */
		AnnouncedHrmpMessagesPerCandidate: StorageDescriptor<[], number, false, never>;
		/**
		 * The weight we reserve at the beginning of the block for processing XCMP messages. This
		 * overrides the amount set in the Config trait.
		 */
		ReservedXcmpWeightOverride: StorageDescriptor<[], Anonymize<I4q39t5hn830vp>, true, never>;
		/**
		 * The weight we reserve at the beginning of the block for processing DMP messages. This
		 * overrides the amount set in the Config trait.
		 */
		ReservedDmpWeightOverride: StorageDescriptor<[], Anonymize<I4q39t5hn830vp>, true, never>;
		/**
		 * A custom head data that should be returned as result of `validate_block`.
		 *
		 * See `Pallet::set_custom_validation_head_data` for more information.
		 */
		CustomValidationHeadData: StorageDescriptor<[], Binary, true, never>;
	};
	Timestamp: {
		/**
		 * The current time for the current block.
		 */
		Now: StorageDescriptor<[], bigint, false, never>;
		/**
		 * Whether the timestamp has been updated in this block.
		 *
		 * This value is updated to `true` upon successful submission of a timestamp by a node.
		 * It is then checked at the end of each block execution in the `on_finalize` hook.
		 */
		DidUpdate: StorageDescriptor<[], boolean, false, never>;
	};
	ParachainInfo: {
		/**
        
         */
		ParachainId: StorageDescriptor<[], number, false, never>;
	};
	Balances: {
		/**
		 * The total units issued in the system.
		 */
		TotalIssuance: StorageDescriptor<[], bigint, false, never>;
		/**
		 * The total units of outstanding deactivated balance in the system.
		 */
		InactiveIssuance: StorageDescriptor<[], bigint, false, never>;
		/**
		 * The Balances pallet example of storing the balance of an account.
		 *
		 * # Example
		 *
		 * ```nocompile
		 * impl pallet_balances::Config for Runtime {
		 * type AccountStore = StorageMapShim<Self::Account<Runtime>, frame_system::Provider<Runtime>, AccountId, Self::AccountData<Balance>>
		 * }
		 * ```
		 *
		 * You can also store the balance of an account in the `System` pallet.
		 *
		 * # Example
		 *
		 * ```nocompile
		 * impl pallet_balances::Config for Runtime {
		 * type AccountStore = System
		 * }
		 * ```
		 *
		 * But this comes with tradeoffs, storing account balances in the system pallet stores
		 * `frame_system` data alongside the account data contrary to storing account balances in the
		 * `Balances` pallet, which uses a `StorageMap` to store balances data only.
		 * NOTE: This is only used in the case that this pallet is used to store balances.
		 */
		Account: StorageDescriptor<[Key: SS58String], Anonymize<I1q8tnt1cluu5j>, false, never>;
		/**
		 * Any liquidity locks on some account balances.
		 * NOTE: Should only be accessed when setting, changing and freeing a lock.
		 *
		 * Use of locks is deprecated in favour of freezes. See `https://github.com/paritytech/substrate/pull/12951/`
		 */
		Locks: StorageDescriptor<[Key: SS58String], Anonymize<I8ds64oj6581v0>, false, never>;
		/**
		 * Named reserves on some account balances.
		 *
		 * Use of reserves is deprecated in favour of holds. See `https://github.com/paritytech/substrate/pull/12951/`
		 */
		Reserves: StorageDescriptor<[Key: SS58String], Anonymize<Ia7pdug7cdsg8g>, false, never>;
		/**
		 * Holds on account balances.
		 */
		Holds: StorageDescriptor<[Key: SS58String], Anonymize<I63lqt6dl3kn9k>, false, never>;
		/**
		 * Freeze locks on account balances.
		 */
		Freezes: StorageDescriptor<[Key: SS58String], Anonymize<I9bin2jc70qt6q>, false, never>;
	};
	TransactionPayment: {
		/**
        
         */
		NextFeeMultiplier: StorageDescriptor<[], bigint, false, never>;
		/**
        
         */
		StorageVersion: StorageDescriptor<[], TransactionPaymentReleases, false, never>;
		/**
		 * The `OnChargeTransaction` stores the withdrawn tx fee here.
		 *
		 * Use `withdraw_txfee` and `remaining_txfee` to access from outside the crate.
		 */
		TxPaymentCredit: StorageDescriptor<[], bigint, true, never>;
	};
	Sudo: {
		/**
		 * The `AccountId` of the sudo key.
		 */
		Key: StorageDescriptor<[], SS58String, true, never>;
	};
	Multisig: {
		/**
		 * The set of open multisig operations.
		 */
		Multisigs: StorageDescriptor<
			Anonymize<I8uo3fpd3bcc6f>,
			Anonymize<Iag146hmjgqfgj>,
			true,
			never
		>;
	};
	Authorship: {
		/**
		 * Author of current block.
		 */
		Author: StorageDescriptor<[], SS58String, true, never>;
	};
	CollatorSelection: {
		/**
		 * The invulnerable, permissioned collators. This list must be sorted.
		 */
		Invulnerables: StorageDescriptor<[], Anonymize<Ia2lhg7l2hilo3>, false, never>;
		/**
		 * The (community, limited) collation candidates. `Candidates` and `Invulnerables` should be
		 * mutually exclusive.
		 *
		 * This list is sorted in ascending order by deposit and when the deposits are equal, the least
		 * recently updated is considered greater.
		 */
		CandidateList: StorageDescriptor<[], Anonymize<Ifi4da1gej1fri>, false, never>;
		/**
		 * Last block authored by collator.
		 */
		LastAuthoredBlock: StorageDescriptor<[Key: SS58String], number, false, never>;
		/**
		 * Desired number of candidates.
		 *
		 * This should ideally always be less than [`Config::MaxCandidates`] for weights to be correct.
		 */
		DesiredCandidates: StorageDescriptor<[], number, false, never>;
		/**
		 * Fixed amount to deposit to become a collator.
		 *
		 * When a collator calls `leave_intent` they immediately receive the deposit back.
		 */
		CandidacyBond: StorageDescriptor<[], bigint, false, never>;
	};
	Session: {
		/**
		 * The current set of validators.
		 */
		Validators: StorageDescriptor<[], Anonymize<Ia2lhg7l2hilo3>, false, never>;
		/**
		 * Current index of the session.
		 */
		CurrentIndex: StorageDescriptor<[], number, false, never>;
		/**
		 * True if the underlying economic identities or weighting behind the validators
		 * has changed in the queued validator set.
		 */
		QueuedChanged: StorageDescriptor<[], boolean, false, never>;
		/**
		 * The queued keys for the next session. When the next session begins, these keys
		 * will be used to determine the validator's session keys.
		 */
		QueuedKeys: StorageDescriptor<[], Anonymize<Ifvgo9568rpmqc>, false, never>;
		/**
		 * Indices of disabled validators.
		 *
		 * The vec is always kept sorted so that we can find whether a given validator is
		 * disabled using binary search. It gets cleared when `on_session_ending` returns
		 * a new set of identities.
		 */
		DisabledValidators: StorageDescriptor<[], Anonymize<I95g6i7ilua7lq>, false, never>;
		/**
		 * The next session keys for a validator.
		 */
		NextKeys: StorageDescriptor<[Key: SS58String], FixedSizeBinary<32>, true, never>;
		/**
		 * The owner of a key. The key is the `KeyTypeId` + the encoded key.
		 */
		KeyOwner: StorageDescriptor<[Key: Anonymize<I82jm9g7pufuel>], SS58String, true, never>;
		/**
		 * Accounts whose keys were set via `SessionInterface` (external path) without
		 * incrementing the consumer reference or placing a key deposit. `do_purge_keys`
		 * only decrements consumers for accounts that were registered through the local
		 * session pallet.
		 */
		ExternallySetKeys: StorageDescriptor<[Key: SS58String], null, true, never>;
	};
	Aura: {
		/**
		 * The current authority set.
		 */
		Authorities: StorageDescriptor<[], Anonymize<Ic5m5lp1oioo8r>, false, never>;
		/**
		 * The current slot of this block.
		 *
		 * This will be set in `on_initialize`.
		 */
		CurrentSlot: StorageDescriptor<[], bigint, false, never>;
	};
	AuraExt: {
		/**
		 * Serves as cache for the authorities.
		 *
		 * The authorities in AuRa are overwritten in `on_initialize` when we switch to a new session,
		 * but we require the old authorities to verify the seal when validating a PoV. This will
		 * always be updated to the latest AuRa authorities in `on_finalize`.
		 */
		Authorities: StorageDescriptor<[], Anonymize<Ic5m5lp1oioo8r>, false, never>;
		/**
		 * Current relay chain slot paired with a number of authored blocks.
		 *
		 * This is updated in [`FixedVelocityConsensusHook::on_state_proof`] with the current relay
		 * chain slot as provided by the relay chain state proof.
		 */
		RelaySlotInfo: StorageDescriptor<[], Anonymize<I6cs1itejju2vv>, true, never>;
	};
	XcmpQueue: {
		/**
		 * The suspended inbound XCMP channels. All others are not suspended.
		 *
		 * This is a `StorageValue` instead of a `StorageMap` since we expect multiple reads per block
		 * to different keys with a one byte payload. The access to `BoundedBTreeSet` will be cached
		 * within the block and therefore only included once in the proof size.
		 *
		 * NOTE: The PoV benchmarking cannot know this and will over-estimate, but the actual proof
		 * will be smaller.
		 */
		InboundXcmpSuspended: StorageDescriptor<[], Anonymize<Icgljjb6j82uhn>, false, never>;
		/**
		 * The non-empty XCMP channels in order of becoming non-empty, and the index of the first
		 * and last outbound message. If the two indices are equal, then it indicates an empty
		 * queue and there must be a non-`Ok` `OutboundStatus`. We assume queues grow no greater
		 * than 65535 items. Queue indices for normal messages begin at one; zero is reserved in
		 * case of the need to send a high-priority signal message this block.
		 * The bool is true if there is a signal message waiting to be sent.
		 */
		OutboundXcmpStatus: StorageDescriptor<[], Anonymize<Ib77b0fp1a6mjr>, false, never>;
		/**
		 * The messages outbound in a given XCMP channel.
		 */
		OutboundXcmpMessages: StorageDescriptor<Anonymize<I5g2vv0ckl2m8b>, Binary, false, never>;
		/**
		 * Any signal messages waiting to be sent.
		 */
		SignalMessages: StorageDescriptor<[Key: number], Binary, false, never>;
		/**
		 * The configuration which controls the dynamics of the outbound queue.
		 */
		QueueConfig: StorageDescriptor<[], Anonymize<Ifup3lg9ro8a0f>, false, never>;
		/**
		 * Whether or not the XCMP queue is suspended from executing incoming XCMs or not.
		 */
		QueueSuspended: StorageDescriptor<[], boolean, false, never>;
		/**
		 * The factor to multiply the base delivery fee by.
		 */
		DeliveryFeeFactor: StorageDescriptor<[Key: number], bigint, false, never>;
	};
	PolkadotXcm: {
		/**
		 * The latest available query index.
		 */
		QueryCounter: StorageDescriptor<[], bigint, false, never>;
		/**
		 * The ongoing queries.
		 */
		Queries: StorageDescriptor<[Key: bigint], Anonymize<I5qfubnuvrnqn6>, true, never>;
		/**
		 * The existing asset traps.
		 *
		 * Key is the blake2 256 hash of (origin, versioned `Assets`) pair. Value is the number of
		 * times this pair has been trapped (usually just 1 if it exists at all).
		 */
		AssetTraps: StorageDescriptor<[Key: FixedSizeBinary<32>], number, false, never>;
		/**
		 * Default version to encode XCM when latest version of destination is unknown. If `None`,
		 * then the destinations whose XCM version is unknown are considered unreachable.
		 */
		SafeXcmVersion: StorageDescriptor<[], number, true, never>;
		/**
		 * The Latest versions that we know various locations support.
		 */
		SupportedVersion: StorageDescriptor<Anonymize<I8t3u2dv73ahbd>, number, true, never>;
		/**
		 * All locations that we have requested version notifications from.
		 */
		VersionNotifiers: StorageDescriptor<Anonymize<I8t3u2dv73ahbd>, bigint, true, never>;
		/**
		 * The target locations that are subscribed to our version changes, as well as the most recent
		 * of our versions we informed them of.
		 */
		VersionNotifyTargets: StorageDescriptor<
			Anonymize<I8t3u2dv73ahbd>,
			Anonymize<I7vlvrrl2pnbgk>,
			true,
			never
		>;
		/**
		 * Destinations whose latest XCM version we would like to know. Duplicates not allowed, and
		 * the `u32` counter is the number of times that a send to the destination has been attempted,
		 * which is used as a prioritization.
		 */
		VersionDiscoveryQueue: StorageDescriptor<[], Anonymize<Ie0rpl5bahldfk>, false, never>;
		/**
		 * The current migration's stage, if any.
		 */
		CurrentMigration: StorageDescriptor<[], XcmPalletVersionMigrationStage, true, never>;
		/**
		 * Fungible assets which we know are locked on a remote chain.
		 */
		RemoteLockedFungibles: StorageDescriptor<
			Anonymize<Ie849h3gncgvok>,
			Anonymize<I7e5oaj2qi4kl1>,
			true,
			never
		>;
		/**
		 * Fungible assets which we know are locked on this chain.
		 */
		LockedFungibles: StorageDescriptor<
			[Key: SS58String],
			Anonymize<Iat62vud7hlod2>,
			true,
			never
		>;
		/**
		 * Global suspension state of the XCM executor.
		 */
		XcmExecutionSuspended: StorageDescriptor<[], boolean, false, never>;
		/**
		 * Whether or not incoming XCMs (both executed locally and received) should be recorded.
		 * Only one XCM program will be recorded at a time.
		 * This is meant to be used in runtime APIs, and it's advised it stays false
		 * for all other use cases, so as to not degrade regular performance.
		 *
		 * Only relevant if this pallet is being used as the [`xcm_executor::traits::RecordXcm`]
		 * implementation in the XCM executor configuration.
		 */
		ShouldRecordXcm: StorageDescriptor<[], boolean, false, never>;
		/**
		 * If [`ShouldRecordXcm`] is set to true, then the last XCM program executed locally
		 * will be stored here.
		 * Runtime APIs can fetch the XCM that was executed by accessing this value.
		 *
		 * Only relevant if this pallet is being used as the [`xcm_executor::traits::RecordXcm`]
		 * implementation in the XCM executor configuration.
		 */
		RecordedXcm: StorageDescriptor<[], Anonymize<Ict03eedr8de9s>, true, never>;
		/**
		 * Map of authorized aliasers of local origins. Each local location can authorize a list of
		 * other locations to alias into it. Each aliaser is only valid until its inner `expiry`
		 * block number.
		 */
		AuthorizedAliases: StorageDescriptor<
			[Key: XcmVersionedLocation],
			Anonymize<Ici7ejds60vj52>,
			true,
			never
		>;
	};
	MessageQueue: {
		/**
		 * The index of the first and last (non-empty) pages.
		 */
		BookStateFor: StorageDescriptor<
			[Key: Anonymize<Iejeo53sea6n4q>],
			Anonymize<Idh2ug6ou4a8og>,
			false,
			never
		>;
		/**
		 * The origin at which we should begin servicing.
		 */
		ServiceHead: StorageDescriptor<[], Anonymize<Iejeo53sea6n4q>, true, never>;
		/**
		 * The map of page indices to pages.
		 */
		Pages: StorageDescriptor<Anonymize<Ib4jhb8tt3uung>, Anonymize<I53esa2ms463bk>, true, never>;
	};
	TemplatePallet: {
		/**
		 * Storage for proof-of-existence claims.
		 * Maps a 32-byte hash to the claim details (owner, block number).
		 */
		Claims: StorageDescriptor<
			[Key: FixedSizeBinary<32>],
			Anonymize<I7offqqltf3agj>,
			true,
			never
		>;
	};
	Revive: {
		/**
		 * A mapping from a contract's code hash to its code.
		 * The code's size is bounded by [`crate::limits::BLOB_BYTES`] for PVM and
		 * [`revm::primitives::eip170::MAX_CODE_SIZE`] for EVM bytecode.
		 */
		PristineCode: StorageDescriptor<[Key: FixedSizeBinary<32>], Binary, true, never>;
		/**
		 * A mapping from a contract's code hash to its code info.
		 */
		CodeInfoOf: StorageDescriptor<
			[Key: FixedSizeBinary<32>],
			Anonymize<I834nfrf667ag1>,
			true,
			never
		>;
		/**
		 * The data associated to a contract or externally owned account.
		 */
		AccountInfoOf: StorageDescriptor<
			[Key: FixedSizeBinary<20>],
			Anonymize<I14i9pui8lc778>,
			true,
			never
		>;
		/**
		 * The immutable data associated with a given account.
		 */
		ImmutableDataOf: StorageDescriptor<[Key: FixedSizeBinary<20>], Binary, true, never>;
		/**
		 * Evicted contracts that await child trie deletion.
		 *
		 * Child trie deletion is a heavy operation depending on the amount of storage items
		 * stored in said trie. Therefore this operation is performed lazily in `on_idle`.
		 */
		DeletionQueue: StorageDescriptor<[Key: number], Binary, true, never>;
		/**
		 * A pair of monotonic counters used to track the latest contract marked for deletion
		 * and the latest deleted contract in queue.
		 */
		DeletionQueueCounter: StorageDescriptor<[], Anonymize<I8t4pajubp34g3>, false, never>;
		/**
		 * Map a Ethereum address to its original `AccountId32`.
		 *
		 * When deriving a `H160` from an `AccountId32` we use a hash function. In order to
		 * reconstruct the original account we need to store the reverse mapping here.
		 * Register your `AccountId32` using [`Pallet::map_account`] in order to
		 * use it with this pallet.
		 */
		OriginalAccount: StorageDescriptor<[Key: FixedSizeBinary<20>], SS58String, true, never>;
		/**
		 * The current Ethereum block that is stored in the `on_finalize` method.
		 *
		 * # Note
		 *
		 * This could be further optimized into the future to store only the minimum
		 * information needed to reconstruct the Ethereum block at the RPC level.
		 *
		 * Since the block is convenient to have around, and the extra details are capped
		 * by a few hashes and the vector of transaction hashes, we store the block here.
		 */
		EthereumBlock: StorageDescriptor<[], Anonymize<I10nrsmn0hji4l>, false, never>;
		/**
		 * Mapping for block number and hashes.
		 *
		 * The maximum number of elements stored is capped by the block hash count `BLOCK_HASH_COUNT`.
		 */
		BlockHash: StorageDescriptor<[Key: number], FixedSizeBinary<32>, false, never>;
		/**
		 * The details needed to reconstruct the receipt info offchain.
		 *
		 * This contains valuable information about the gas used by the transaction.
		 *
		 * NOTE: The item is unbound and should therefore never be read on chain.
		 * It could otherwise inflate the PoV size of a block.
		 */
		ReceiptInfoData: StorageDescriptor<[], Anonymize<I3oiqcurom3m43>, false, never>;
		/**
		 * Incremental ethereum block builder.
		 */
		EthBlockBuilderIR: StorageDescriptor<[], Anonymize<I20ichc5j0l1u7>, false, never>;
		/**
		 * The first transaction and receipt of the ethereum block.
		 *
		 * These values are moved out of the `EthBlockBuilderIR` to avoid serializing and
		 * deserializing them on every transaction. Instead, they are loaded when needed.
		 */
		EthBlockBuilderFirstValues: StorageDescriptor<[], Anonymize<I1p16diuhde12h>, false, never>;
		/**
		 * Debugging settings that can be configured when DebugEnabled config is true.
		 */
		DebugSettingsOf: StorageDescriptor<[], Anonymize<Id4f5q01qh34o3>, false, never>;
	};
};
type ICalls = {
	System: {
		/**
		 * Make some on-chain remark.
		 *
		 * Can be executed by every `origin`.
		 */
		remark: TxDescriptor<Anonymize<I8ofcg5rbj0g2c>>;
		/**
		 * Set the number of pages in the WebAssembly environment's heap.
		 */
		set_heap_pages: TxDescriptor<Anonymize<I4adgbll7gku4i>>;
		/**
		 * Set the new runtime code.
		 */
		set_code: TxDescriptor<Anonymize<I6pjjpfvhvcfru>>;
		/**
		 * Set the new runtime code without doing any checks of the given `code`.
		 *
		 * Note that runtime upgrades will not run if this is called with a not-increasing spec
		 * version!
		 */
		set_code_without_checks: TxDescriptor<Anonymize<I6pjjpfvhvcfru>>;
		/**
		 * Set some items of storage.
		 */
		set_storage: TxDescriptor<Anonymize<I9pj91mj79qekl>>;
		/**
		 * Kill some items from storage.
		 */
		kill_storage: TxDescriptor<Anonymize<I39uah9nss64h9>>;
		/**
		 * Kill all storage items with a key that starts with the given prefix.
		 *
		 * **NOTE:** We rely on the Root origin to provide us the number of subkeys under
		 * the prefix we are removing to accurately calculate the weight of this function.
		 */
		kill_prefix: TxDescriptor<Anonymize<Ik64dknsq7k08>>;
		/**
		 * Make some on-chain remark and emit event.
		 */
		remark_with_event: TxDescriptor<Anonymize<I8ofcg5rbj0g2c>>;
		/**
		 * Authorize an upgrade to a given `code_hash` for the runtime. The runtime can be supplied
		 * later.
		 *
		 * This call requires Root origin.
		 */
		authorize_upgrade: TxDescriptor<Anonymize<Ib51vk42m1po4n>>;
		/**
		 * Authorize an upgrade to a given `code_hash` for the runtime. The runtime can be supplied
		 * later.
		 *
		 * WARNING: This authorizes an upgrade that will take place without any safety checks, for
		 * example that the spec name remains the same and that the version number increases. Not
		 * recommended for normal use. Use `authorize_upgrade` instead.
		 *
		 * This call requires Root origin.
		 */
		authorize_upgrade_without_checks: TxDescriptor<Anonymize<Ib51vk42m1po4n>>;
		/**
		 * Provide the preimage (runtime binary) `code` for an upgrade that has been authorized.
		 *
		 * If the authorization required a version check, this call will ensure the spec name
		 * remains unchanged and that the spec version has increased.
		 *
		 * Depending on the runtime's `OnSetCode` configuration, this function may directly apply
		 * the new `code` in the same block or attempt to schedule the upgrade.
		 *
		 * All origins are allowed.
		 */
		apply_authorized_upgrade: TxDescriptor<Anonymize<I6pjjpfvhvcfru>>;
	};
	ParachainSystem: {
		/**
		 * Set the current validation data.
		 *
		 * This should be invoked exactly once per block. It will panic at the finalization
		 * phase if the call was not invoked.
		 *
		 * The dispatch origin for this call must be `Inherent`
		 *
		 * As a side effect, this function upgrades the current validation function
		 * if the appropriate time has come.
		 */
		set_validation_data: TxDescriptor<Anonymize<Ial23jn8hp0aen>>;
		/**
        
         */
		sudo_send_upward_message: TxDescriptor<Anonymize<Ifpj261e8s63m3>>;
	};
	Timestamp: {
		/**
		 * Set the current time.
		 *
		 * This call should be invoked exactly once per block. It will panic at the finalization
		 * phase, if this call hasn't been invoked by that time.
		 *
		 * The timestamp should be greater than the previous one by the amount specified by
		 * [`Config::MinimumPeriod`].
		 *
		 * The dispatch origin for this call must be _None_.
		 *
		 * This dispatch class is _Mandatory_ to ensure it gets executed in the block. Be aware
		 * that changing the complexity of this call could result exhausting the resources in a
		 * block to execute any other calls.
		 *
		 * ## Complexity
		 * - `O(1)` (Note that implementations of `OnTimestampSet` must also be `O(1)`)
		 * - 1 storage read and 1 storage mutation (codec `O(1)` because of `DidUpdate::take` in
		 * `on_finalize`)
		 * - 1 event handler `on_timestamp_set`. Must be `O(1)`.
		 */
		set: TxDescriptor<Anonymize<Idcr6u6361oad9>>;
	};
	Balances: {
		/**
		 * Transfer some liquid free balance to another account.
		 *
		 * `transfer_allow_death` will set the `FreeBalance` of the sender and receiver.
		 * If the sender's account is below the existential deposit as a result
		 * of the transfer, the account will be reaped.
		 *
		 * The dispatch origin for this call must be `Signed` by the transactor.
		 */
		transfer_allow_death: TxDescriptor<Anonymize<I4ktuaksf5i1gk>>;
		/**
		 * Exactly as `transfer_allow_death`, except the origin must be root and the source account
		 * may be specified.
		 */
		force_transfer: TxDescriptor<Anonymize<I9bqtpv2ii35mp>>;
		/**
		 * Same as the [`transfer_allow_death`] call, but with a check that the transfer will not
		 * kill the origin account.
		 *
		 * 99% of the time you want [`transfer_allow_death`] instead.
		 *
		 * [`transfer_allow_death`]: struct.Pallet.html#method.transfer
		 */
		transfer_keep_alive: TxDescriptor<Anonymize<I4ktuaksf5i1gk>>;
		/**
		 * Transfer the entire transferable balance from the caller account.
		 *
		 * NOTE: This function only attempts to transfer _transferable_ balances. This means that
		 * any locked, reserved, or existential deposits (when `keep_alive` is `true`), will not be
		 * transferred by this function. To ensure that this function results in a killed account,
		 * you might need to prepare the account by removing any reference counters, storage
		 * deposits, etc...
		 *
		 * The dispatch origin of this call must be Signed.
		 *
		 * - `dest`: The recipient of the transfer.
		 * - `keep_alive`: A boolean to determine if the `transfer_all` operation should send all
		 * of the funds the account has, causing the sender account to be killed (false), or
		 * transfer everything except at least the existential deposit, which will guarantee to
		 * keep the sender account alive (true).
		 */
		transfer_all: TxDescriptor<Anonymize<I9j7pagd6d4bda>>;
		/**
		 * Unreserve some balance from a user by force.
		 *
		 * Can only be called by ROOT.
		 */
		force_unreserve: TxDescriptor<Anonymize<I2h9pmio37r7fb>>;
		/**
		 * Upgrade a specified account.
		 *
		 * - `origin`: Must be `Signed`.
		 * - `who`: The account to be upgraded.
		 *
		 * This will waive the transaction fee if at least all but 10% of the accounts needed to
		 * be upgraded. (We let some not have to be upgraded just in order to allow for the
		 * possibility of churn).
		 */
		upgrade_accounts: TxDescriptor<Anonymize<Ibmr18suc9ikh9>>;
		/**
		 * Set the regular balance of a given account.
		 *
		 * The dispatch origin for this call is `root`.
		 */
		force_set_balance: TxDescriptor<Anonymize<I9iq22t0burs89>>;
		/**
		 * Adjust the total issuance in a saturating way.
		 *
		 * Can only be called by root and always needs a positive `delta`.
		 *
		 * # Example
		 */
		force_adjust_total_issuance: TxDescriptor<Anonymize<I5u8olqbbvfnvf>>;
		/**
		 * Burn the specified liquid free balance from the origin account.
		 *
		 * If the origin's account ends up below the existential deposit as a result
		 * of the burn and `keep_alive` is false, the account will be reaped.
		 *
		 * Unlike sending funds to a _burn_ address, which merely makes the funds inaccessible,
		 * this `burn` operation will reduce total issuance by the amount _burned_.
		 */
		burn: TxDescriptor<Anonymize<I5utcetro501ir>>;
	};
	Sudo: {
		/**
		 * Authenticates the sudo key and dispatches a function call with `Root` origin.
		 */
		sudo: TxDescriptor<Anonymize<Iaalag4sajqdff>>;
		/**
		 * Authenticates the sudo key and dispatches a function call with `Root` origin.
		 * This function does not check the weight of the call, and instead allows the
		 * Sudo user to specify the weight of the call.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 */
		sudo_unchecked_weight: TxDescriptor<Anonymize<I8nd3h8unsth6v>>;
		/**
		 * Authenticates the current sudo key and sets the given AccountId (`new`) as the new sudo
		 * key.
		 */
		set_key: TxDescriptor<Anonymize<I8k3rnvpeeh4hv>>;
		/**
		 * Authenticates the sudo key and dispatches a function call with `Signed` origin from
		 * a given account.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 */
		sudo_as: TxDescriptor<Anonymize<Ifup0v752q8jvh>>;
		/**
		 * Permanently removes the sudo key.
		 *
		 * **This cannot be un-done.**
		 */
		remove_key: TxDescriptor<undefined>;
	};
	Multisig: {
		/**
		 * Immediately dispatch a multi-signature call using a single approval from the caller.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 *
		 * - `other_signatories`: The accounts (other than the sender) who are part of the
		 * multi-signature, but do not participate in the approval process.
		 * - `call`: The call to be executed.
		 *
		 * Result is equivalent to the dispatched result.
		 *
		 * ## Complexity
		 * O(Z + C) where Z is the length of the call and C its execution weight.
		 */
		as_multi_threshold_1: TxDescriptor<Anonymize<I9dogfdq00v6br>>;
		/**
		 * Register approval for a dispatch to be made from a deterministic composite account if
		 * approved by a total of `threshold - 1` of `other_signatories`.
		 *
		 * If there are enough, then dispatch the call.
		 *
		 * Payment: `DepositBase` will be reserved if this is the first approval, plus
		 * `threshold` times `DepositFactor`. It is returned once this dispatch happens or
		 * is cancelled.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 *
		 * - `threshold`: The total number of approvals for this dispatch before it is executed.
		 * - `other_signatories`: The accounts (other than the sender) who can approve this
		 * dispatch. May not be empty.
		 * - `maybe_timepoint`: If this is the first approval, then this must be `None`. If it is
		 * not the first approval, then it must be `Some`, with the timepoint (block number and
		 * transaction index) of the first approval transaction.
		 * - `call`: The call to be executed.
		 *
		 * NOTE: Unless this is the final approval, you will generally want to use
		 * `approve_as_multi` instead, since it only requires a hash of the call.
		 *
		 * Result is equivalent to the dispatched result if `threshold` is exactly `1`. Otherwise
		 * on success, result is `Ok` and the result from the interior call, if it was executed,
		 * may be found in the deposited `MultisigExecuted` event.
		 *
		 * ## Complexity
		 * - `O(S + Z + Call)`.
		 * - Up to one balance-reserve or unreserve operation.
		 * - One passthrough operation, one insert, both `O(S)` where `S` is the number of
		 * signatories. `S` is capped by `MaxSignatories`, with weight being proportional.
		 * - One call encode & hash, both of complexity `O(Z)` where `Z` is tx-len.
		 * - One encode & hash, both of complexity `O(S)`.
		 * - Up to one binary search and insert (`O(logS + S)`).
		 * - I/O: 1 read `O(S)`, up to 1 mutate `O(S)`. Up to one remove.
		 * - One event.
		 * - The weight of the `call`.
		 * - Storage: inserts one item, value size bounded by `MaxSignatories`, with a deposit
		 * taken for its lifetime of `DepositBase + threshold * DepositFactor`.
		 */
		as_multi: TxDescriptor<Anonymize<Ie75pdmrsbc71n>>;
		/**
		 * Register approval for a dispatch to be made from a deterministic composite account if
		 * approved by a total of `threshold - 1` of `other_signatories`.
		 *
		 * Payment: `DepositBase` will be reserved if this is the first approval, plus
		 * `threshold` times `DepositFactor`. It is returned once this dispatch happens or
		 * is cancelled.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 *
		 * - `threshold`: The total number of approvals for this dispatch before it is executed.
		 * - `other_signatories`: The accounts (other than the sender) who can approve this
		 * dispatch. May not be empty.
		 * - `maybe_timepoint`: If this is the first approval, then this must be `None`. If it is
		 * not the first approval, then it must be `Some`, with the timepoint (block number and
		 * transaction index) of the first approval transaction.
		 * - `call_hash`: The hash of the call to be executed.
		 *
		 * NOTE: If this is the final approval, you will want to use `as_multi` instead.
		 *
		 * ## Complexity
		 * - `O(S)`.
		 * - Up to one balance-reserve or unreserve operation.
		 * - One passthrough operation, one insert, both `O(S)` where `S` is the number of
		 * signatories. `S` is capped by `MaxSignatories`, with weight being proportional.
		 * - One encode & hash, both of complexity `O(S)`.
		 * - Up to one binary search and insert (`O(logS + S)`).
		 * - I/O: 1 read `O(S)`, up to 1 mutate `O(S)`. Up to one remove.
		 * - One event.
		 * - Storage: inserts one item, value size bounded by `MaxSignatories`, with a deposit
		 * taken for its lifetime of `DepositBase + threshold * DepositFactor`.
		 */
		approve_as_multi: TxDescriptor<Anonymize<Ideaemvoneh309>>;
		/**
		 * Cancel a pre-existing, on-going multisig transaction. Any deposit reserved previously
		 * for this operation will be unreserved on success.
		 *
		 * The dispatch origin for this call must be _Signed_.
		 *
		 * - `threshold`: The total number of approvals for this dispatch before it is executed.
		 * - `other_signatories`: The accounts (other than the sender) who can approve this
		 * dispatch. May not be empty.
		 * - `timepoint`: The timepoint (block number and transaction index) of the first approval
		 * transaction for this dispatch.
		 * - `call_hash`: The hash of the call to be executed.
		 *
		 * ## Complexity
		 * - `O(S)`.
		 * - Up to one balance-reserve or unreserve operation.
		 * - One passthrough operation, one insert, both `O(S)` where `S` is the number of
		 * signatories. `S` is capped by `MaxSignatories`, with weight being proportional.
		 * - One encode & hash, both of complexity `O(S)`.
		 * - One event.
		 * - I/O: 1 read `O(S)`, one remove.
		 * - Storage: removes one item.
		 */
		cancel_as_multi: TxDescriptor<Anonymize<I3d9o9d7epp66v>>;
		/**
		 * Poke the deposit reserved for an existing multisig operation.
		 *
		 * The dispatch origin for this call must be _Signed_ and must be the original depositor of
		 * the multisig operation.
		 *
		 * The transaction fee is waived if the deposit amount has changed.
		 *
		 * - `threshold`: The total number of approvals needed for this multisig.
		 * - `other_signatories`: The accounts (other than the sender) who are part of the
		 * multisig.
		 * - `call_hash`: The hash of the call this deposit is reserved for.
		 *
		 * Emits `DepositPoked` if successful.
		 */
		poke_deposit: TxDescriptor<Anonymize<I6lqh1vgb4mcja>>;
	};
	CollatorSelection: {
		/**
		 * Set the list of invulnerable (fixed) collators. These collators must do some
		 * preparation, namely to have registered session keys.
		 *
		 * The call will remove any accounts that have not registered keys from the set. That is,
		 * it is non-atomic; the caller accepts all `AccountId`s passed in `new` _individually_ as
		 * acceptable Invulnerables, and is not proposing a _set_ of new Invulnerables.
		 *
		 * This call does not maintain mutual exclusivity of `Invulnerables` and `Candidates`. It
		 * is recommended to use a batch of `add_invulnerable` and `remove_invulnerable` instead. A
		 * `batch_all` can also be used to enforce atomicity. If any candidates are included in
		 * `new`, they should be removed with `remove_invulnerable_candidate` after execution.
		 *
		 * Must be called by the `UpdateOrigin`.
		 */
		set_invulnerables: TxDescriptor<Anonymize<Ifccifqltb5obi>>;
		/**
		 * Set the ideal number of non-invulnerable collators. If lowering this number, then the
		 * number of running collators could be higher than this figure. Aside from that edge case,
		 * there should be no other way to have more candidates than the desired number.
		 *
		 * The origin for this call must be the `UpdateOrigin`.
		 */
		set_desired_candidates: TxDescriptor<Anonymize<Iadtsfv699cq8b>>;
		/**
		 * Set the candidacy bond amount.
		 *
		 * If the candidacy bond is increased by this call, all current candidates which have a
		 * deposit lower than the new bond will be kicked from the list and get their deposits
		 * back.
		 *
		 * The origin for this call must be the `UpdateOrigin`.
		 */
		set_candidacy_bond: TxDescriptor<Anonymize<Ialpmgmhr3gk5r>>;
		/**
		 * Register this account as a collator candidate. The account must (a) already have
		 * registered session keys and (b) be able to reserve the `CandidacyBond`.
		 *
		 * This call is not available to `Invulnerable` collators.
		 */
		register_as_candidate: TxDescriptor<undefined>;
		/**
		 * Deregister `origin` as a collator candidate. Note that the collator can only leave on
		 * session change. The `CandidacyBond` will be unreserved immediately.
		 *
		 * This call will fail if the total number of candidates would drop below
		 * `MinEligibleCollators`.
		 */
		leave_intent: TxDescriptor<undefined>;
		/**
		 * Add a new account `who` to the list of `Invulnerables` collators. `who` must have
		 * registered session keys. If `who` is a candidate, they will be removed.
		 *
		 * The origin for this call must be the `UpdateOrigin`.
		 */
		add_invulnerable: TxDescriptor<Anonymize<I4cbvqmqadhrea>>;
		/**
		 * Remove an account `who` from the list of `Invulnerables` collators. `Invulnerables` must
		 * be sorted.
		 *
		 * The origin for this call must be the `UpdateOrigin`.
		 */
		remove_invulnerable: TxDescriptor<Anonymize<I4cbvqmqadhrea>>;
		/**
		 * Update the candidacy bond of collator candidate `origin` to a new amount `new_deposit`.
		 *
		 * Setting a `new_deposit` that is lower than the current deposit while `origin` is
		 * occupying a top-`DesiredCandidates` slot is not allowed.
		 *
		 * This call will fail if `origin` is not a collator candidate, the updated bond is lower
		 * than the minimum candidacy bond, and/or the amount cannot be reserved.
		 */
		update_bond: TxDescriptor<Anonymize<I3sdol54kg5jaq>>;
		/**
		 * The caller `origin` replaces a candidate `target` in the collator candidate list by
		 * reserving `deposit`. The amount `deposit` reserved by the caller must be greater than
		 * the existing bond of the target it is trying to replace.
		 *
		 * This call will fail if the caller is already a collator candidate or invulnerable, the
		 * caller does not have registered session keys, the target is not a collator candidate,
		 * and/or the `deposit` amount cannot be reserved.
		 */
		take_candidate_slot: TxDescriptor<Anonymize<I8fougodaj6di6>>;
	};
	Session: {
		/**
		 * Sets the session key(s) of the function caller to `keys`.
		 * Allows an account to set its session key prior to becoming a validator.
		 * This doesn't take effect until the next session.
		 *
		 * The dispatch origin of this function must be signed.
		 *
		 * ## Complexity
		 * - `O(1)`. Actual cost depends on the number of length of `T::Keys::key_ids()` which is
		 * fixed.
		 */
		set_keys: TxDescriptor<Anonymize<I81vt5eq60l4b6>>;
		/**
		 * Removes any session key(s) of the function caller.
		 *
		 * This doesn't take effect until the next session.
		 *
		 * The dispatch origin of this function must be Signed and the account must be either be
		 * convertible to a validator ID using the chain's typical addressing system (this usually
		 * means being a controller account) or directly convertible into a validator ID (which
		 * usually means being a stash account).
		 *
		 * ## Complexity
		 * - `O(1)` in number of key types. Actual cost depends on the number of length of
		 * `T::Keys::key_ids()` which is fixed.
		 */
		purge_keys: TxDescriptor<undefined>;
	};
	XcmpQueue: {
		/**
		 * Suspends all XCM executions for the XCMP queue, regardless of the sender's origin.
		 *
		 * - `origin`: Must pass `ControllerOrigin`.
		 */
		suspend_xcm_execution: TxDescriptor<undefined>;
		/**
		 * Resumes all XCM executions for the XCMP queue.
		 *
		 * Note that this function doesn't change the status of the in/out bound channels.
		 *
		 * - `origin`: Must pass `ControllerOrigin`.
		 */
		resume_xcm_execution: TxDescriptor<undefined>;
		/**
		 * Overwrites the number of pages which must be in the queue for the other side to be
		 * told to suspend their sending.
		 *
		 * - `origin`: Must pass `Root`.
		 * - `new`: Desired value for `QueueConfigData.suspend_value`
		 */
		update_suspend_threshold: TxDescriptor<Anonymize<I3vh014cqgmrfd>>;
		/**
		 * Overwrites the number of pages which must be in the queue after which we drop any
		 * further messages from the channel.
		 *
		 * - `origin`: Must pass `Root`.
		 * - `new`: Desired value for `QueueConfigData.drop_threshold`
		 */
		update_drop_threshold: TxDescriptor<Anonymize<I3vh014cqgmrfd>>;
		/**
		 * Overwrites the number of pages which the queue must be reduced to before it signals
		 * that message sending may recommence after it has been suspended.
		 *
		 * - `origin`: Must pass `Root`.
		 * - `new`: Desired value for `QueueConfigData.resume_threshold`
		 */
		update_resume_threshold: TxDescriptor<Anonymize<I3vh014cqgmrfd>>;
	};
	PolkadotXcm: {
		/**
        
         */
		send: TxDescriptor<Anonymize<Ia5cotcvi888ln>>;
		/**
		 * Teleport some assets from the local chain to some destination chain.
		 *
		 * **This function is deprecated: Use `limited_teleport_assets` instead.**
		 *
		 * Fee payment on the destination side is made from the asset in the `assets` vector of
		 * index `fee_asset_item`. The weight limit for fees is not provided and thus is unlimited,
		 * with all fees taken as needed from the asset.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `[Parent,
		 * Parachain(..)]` to send from parachain to parachain, or `[Parachain(..)]` to send from
		 * relay to parachain.
		 * - `beneficiary`: A beneficiary location for the assets in the context of `dest`. Will
		 * generally be an `AccountId32` value.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` chain.
		 * - `fee_asset_item`: The index into `assets` of the item which should be used to pay
		 * fees.
		 */
		teleport_assets: TxDescriptor<Anonymize<I21jsa919m88fd>>;
		/**
		 * Transfer some assets from the local chain to the destination chain through their local,
		 * destination or remote reserve.
		 *
		 * `assets` must have same reserve location and may not be teleportable to `dest`.
		 * - `assets` have local reserve: transfer assets to sovereign account of destination
		 * chain and forward a notification XCM to `dest` to mint and deposit reserve-based
		 * assets to `beneficiary`.
		 * - `assets` have destination reserve: burn local assets and forward a notification to
		 * `dest` chain to withdraw the reserve assets from this chain's sovereign account and
		 * deposit them to `beneficiary`.
		 * - `assets` have remote reserve: burn local assets, forward XCM to reserve chain to move
		 * reserves from this chain's SA to `dest` chain's SA, and forward another XCM to `dest`
		 * to mint and deposit reserve-based assets to `beneficiary`.
		 *
		 * **This function is deprecated: Use `limited_reserve_transfer_assets` instead.**
		 *
		 * Fee payment on the destination side is made from the asset in the `assets` vector of
		 * index `fee_asset_item`. The weight limit for fees is not provided and thus is unlimited,
		 * with all fees taken as needed from the asset.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `[Parent,
		 * Parachain(..)]` to send from parachain to parachain, or `[Parachain(..)]` to send from
		 * relay to parachain.
		 * - `beneficiary`: A beneficiary location for the assets in the context of `dest`. Will
		 * generally be an `AccountId32` value.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` (and possibly reserve) chains.
		 * - `fee_asset_item`: The index into `assets` of the item which should be used to pay
		 * fees.
		 */
		reserve_transfer_assets: TxDescriptor<Anonymize<I21jsa919m88fd>>;
		/**
		 * Execute an XCM message from a local, signed, origin.
		 *
		 * An event is deposited indicating whether `msg` could be executed completely or only
		 * partially.
		 *
		 * No more than `max_weight` will be used in its attempted execution. If this is less than
		 * the maximum amount of weight that the message could take to be executed, then no
		 * execution attempt will be made.
		 */
		execute: TxDescriptor<Anonymize<Iegif7m3upfe1k>>;
		/**
		 * Extoll that a particular destination can be communicated with through a particular
		 * version of XCM.
		 *
		 * - `origin`: Must be an origin specified by AdminOrigin.
		 * - `location`: The destination that is being described.
		 * - `xcm_version`: The latest version of XCM that `location` supports.
		 */
		force_xcm_version: TxDescriptor<Anonymize<I9kt8c221c83ln>>;
		/**
		 * Set a safe XCM version (the version that XCM should be encoded with if the most recent
		 * version a destination can accept is unknown).
		 *
		 * - `origin`: Must be an origin specified by AdminOrigin.
		 * - `maybe_xcm_version`: The default XCM encoding version, or `None` to disable.
		 */
		force_default_xcm_version: TxDescriptor<Anonymize<Ic76kfh5ebqkpl>>;
		/**
		 * Ask a location to notify us regarding their XCM version and any changes to it.
		 *
		 * - `origin`: Must be an origin specified by AdminOrigin.
		 * - `location`: The location to which we should subscribe for XCM version notifications.
		 */
		force_subscribe_version_notify: TxDescriptor<Anonymize<Icscpmubum33bq>>;
		/**
		 * Require that a particular destination should no longer notify us regarding any XCM
		 * version changes.
		 *
		 * - `origin`: Must be an origin specified by AdminOrigin.
		 * - `location`: The location to which we are currently subscribed for XCM version
		 * notifications which we no longer desire.
		 */
		force_unsubscribe_version_notify: TxDescriptor<Anonymize<Icscpmubum33bq>>;
		/**
		 * Transfer some assets from the local chain to the destination chain through their local,
		 * destination or remote reserve.
		 *
		 * `assets` must have same reserve location and may not be teleportable to `dest`.
		 * - `assets` have local reserve: transfer assets to sovereign account of destination
		 * chain and forward a notification XCM to `dest` to mint and deposit reserve-based
		 * assets to `beneficiary`.
		 * - `assets` have destination reserve: burn local assets and forward a notification to
		 * `dest` chain to withdraw the reserve assets from this chain's sovereign account and
		 * deposit them to `beneficiary`.
		 * - `assets` have remote reserve: burn local assets, forward XCM to reserve chain to move
		 * reserves from this chain's SA to `dest` chain's SA, and forward another XCM to `dest`
		 * to mint and deposit reserve-based assets to `beneficiary`.
		 *
		 * Fee payment on the destination side is made from the asset in the `assets` vector of
		 * index `fee_asset_item`, up to enough to pay for `weight_limit` of weight. If more weight
		 * is needed than `weight_limit`, then the operation will fail and the sent assets may be
		 * at risk.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `[Parent,
		 * Parachain(..)]` to send from parachain to parachain, or `[Parachain(..)]` to send from
		 * relay to parachain.
		 * - `beneficiary`: A beneficiary location for the assets in the context of `dest`. Will
		 * generally be an `AccountId32` value.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` (and possibly reserve) chains.
		 * - `fee_asset_item`: The index into `assets` of the item which should be used to pay
		 * fees.
		 * - `weight_limit`: The remote-side weight limit, if any, for the XCM fee purchase.
		 */
		limited_reserve_transfer_assets: TxDescriptor<Anonymize<I21d2olof7eb60>>;
		/**
		 * Teleport some assets from the local chain to some destination chain.
		 *
		 * Fee payment on the destination side is made from the asset in the `assets` vector of
		 * index `fee_asset_item`, up to enough to pay for `weight_limit` of weight. If more weight
		 * is needed than `weight_limit`, then the operation will fail and the sent assets may be
		 * at risk.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `[Parent,
		 * Parachain(..)]` to send from parachain to parachain, or `[Parachain(..)]` to send from
		 * relay to parachain.
		 * - `beneficiary`: A beneficiary location for the assets in the context of `dest`. Will
		 * generally be an `AccountId32` value.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` chain.
		 * - `fee_asset_item`: The index into `assets` of the item which should be used to pay
		 * fees.
		 * - `weight_limit`: The remote-side weight limit, if any, for the XCM fee purchase.
		 */
		limited_teleport_assets: TxDescriptor<Anonymize<I21d2olof7eb60>>;
		/**
		 * Set or unset the global suspension state of the XCM executor.
		 *
		 * - `origin`: Must be an origin specified by AdminOrigin.
		 * - `suspended`: `true` to suspend, `false` to resume.
		 */
		force_suspension: TxDescriptor<Anonymize<Ibgm4rnf22lal1>>;
		/**
		 * Transfer some assets from the local chain to the destination chain through their local,
		 * destination or remote reserve, or through teleports.
		 *
		 * Fee payment on the destination side is made from the asset in the `assets` vector of
		 * index `fee_asset_item` (hence referred to as `fees`), up to enough to pay for
		 * `weight_limit` of weight. If more weight is needed than `weight_limit`, then the
		 * operation will fail and the sent assets may be at risk.
		 *
		 * `assets` (excluding `fees`) must have same reserve location or otherwise be teleportable
		 * to `dest`, no limitations imposed on `fees`.
		 * - for local reserve: transfer assets to sovereign account of destination chain and
		 * forward a notification XCM to `dest` to mint and deposit reserve-based assets to
		 * `beneficiary`.
		 * - for destination reserve: burn local assets and forward a notification to `dest` chain
		 * to withdraw the reserve assets from this chain's sovereign account and deposit them
		 * to `beneficiary`.
		 * - for remote reserve: burn local assets, forward XCM to reserve chain to move reserves
		 * from this chain's SA to `dest` chain's SA, and forward another XCM to `dest` to mint
		 * and deposit reserve-based assets to `beneficiary`.
		 * - for teleports: burn local assets and forward XCM to `dest` chain to mint/teleport
		 * assets and deposit them to `beneficiary`.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `X2(Parent,
		 * Parachain(..))` to send from parachain to parachain, or `X1(Parachain(..))` to send
		 * from relay to parachain.
		 * - `beneficiary`: A beneficiary location for the assets in the context of `dest`. Will
		 * generally be an `AccountId32` value.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` (and possibly reserve) chains.
		 * - `fee_asset_item`: The index into `assets` of the item which should be used to pay
		 * fees.
		 * - `weight_limit`: The remote-side weight limit, if any, for the XCM fee purchase.
		 */
		transfer_assets: TxDescriptor<Anonymize<I21d2olof7eb60>>;
		/**
		 * Claims assets trapped on this pallet because of leftover assets during XCM execution.
		 *
		 * - `origin`: Anyone can call this extrinsic.
		 * - `assets`: The exact assets that were trapped. Use the version to specify what version
		 * was the latest when they were trapped.
		 * - `beneficiary`: The location/account where the claimed assets will be deposited.
		 */
		claim_assets: TxDescriptor<Anonymize<Ie68np0vpihith>>;
		/**
		 * Transfer assets from the local chain to the destination chain using explicit transfer
		 * types for assets and fees.
		 *
		 * `assets` must have same reserve location or may be teleportable to `dest`. Caller must
		 * provide the `assets_transfer_type` to be used for `assets`:
		 * - `TransferType::LocalReserve`: transfer assets to sovereign account of destination
		 * chain and forward a notification XCM to `dest` to mint and deposit reserve-based
		 * assets to `beneficiary`.
		 * - `TransferType::DestinationReserve`: burn local assets and forward a notification to
		 * `dest` chain to withdraw the reserve assets from this chain's sovereign account and
		 * deposit them to `beneficiary`.
		 * - `TransferType::RemoteReserve(reserve)`: burn local assets, forward XCM to `reserve`
		 * chain to move reserves from this chain's SA to `dest` chain's SA, and forward another
		 * XCM to `dest` to mint and deposit reserve-based assets to `beneficiary`. Typically
		 * the remote `reserve` is Asset Hub.
		 * - `TransferType::Teleport`: burn local assets and forward XCM to `dest` chain to
		 * mint/teleport assets and deposit them to `beneficiary`.
		 *
		 * On the destination chain, as well as any intermediary hops, `BuyExecution` is used to
		 * buy execution using transferred `assets` identified by `remote_fees_id`.
		 * Make sure enough of the specified `remote_fees_id` asset is included in the given list
		 * of `assets`. `remote_fees_id` should be enough to pay for `weight_limit`. If more weight
		 * is needed than `weight_limit`, then the operation will fail and the sent assets may be
		 * at risk.
		 *
		 * `remote_fees_id` may use different transfer type than rest of `assets` and can be
		 * specified through `fees_transfer_type`.
		 *
		 * The caller needs to specify what should happen to the transferred assets once they reach
		 * the `dest` chain. This is done through the `custom_xcm_on_dest` parameter, which
		 * contains the instructions to execute on `dest` as a final step.
		 * This is usually as simple as:
		 * `Xcm(vec![DepositAsset { assets: Wild(AllCounted(assets.len())), beneficiary }])`,
		 * but could be something more exotic like sending the `assets` even further.
		 *
		 * - `origin`: Must be capable of withdrawing the `assets` and executing XCM.
		 * - `dest`: Destination context for the assets. Will typically be `[Parent,
		 * Parachain(..)]` to send from parachain to parachain, or `[Parachain(..)]` to send from
		 * relay to parachain, or `(parents: 2, (GlobalConsensus(..), ..))` to send from
		 * parachain across a bridge to another ecosystem destination.
		 * - `assets`: The assets to be withdrawn. This should include the assets used to pay the
		 * fee on the `dest` (and possibly reserve) chains.
		 * - `assets_transfer_type`: The XCM `TransferType` used to transfer the `assets`.
		 * - `remote_fees_id`: One of the included `assets` to be used to pay fees.
		 * - `fees_transfer_type`: The XCM `TransferType` used to transfer the `fees` assets.
		 * - `custom_xcm_on_dest`: The XCM to be executed on `dest` chain as the last step of the
		 * transfer, which also determines what happens to the assets on the destination chain.
		 * - `weight_limit`: The remote-side weight limit, if any, for the XCM fee purchase.
		 */
		transfer_assets_using_type_and_then: TxDescriptor<Anonymize<I9bnv6lu0crf1q>>;
		/**
		 * Authorize another `aliaser` location to alias into the local `origin` making this call.
		 * The `aliaser` is only authorized until the provided `expiry` block number.
		 * The call can also be used for a previously authorized alias in order to update its
		 * `expiry` block number.
		 *
		 * Usually useful to allow your local account to be aliased into from a remote location
		 * also under your control (like your account on another chain).
		 *
		 * WARNING: make sure the caller `origin` (you) trusts the `aliaser` location to act in
		 * their/your name. Once authorized using this call, the `aliaser` can freely impersonate
		 * `origin` in XCM programs executed on the local chain.
		 */
		add_authorized_alias: TxDescriptor<Anonymize<Iauhjqifrdklq7>>;
		/**
		 * Remove a previously authorized `aliaser` from the list of locations that can alias into
		 * the local `origin` making this call.
		 */
		remove_authorized_alias: TxDescriptor<Anonymize<Ie1uso9m8rt5cf>>;
		/**
		 * Remove all previously authorized `aliaser`s that can alias into the local `origin`
		 * making this call.
		 */
		remove_all_authorized_aliases: TxDescriptor<undefined>;
	};
	MessageQueue: {
		/**
		 * Remove a page which has no more messages remaining to be processed or is stale.
		 */
		reap_page: TxDescriptor<Anonymize<I40pqum1mu8qg3>>;
		/**
		 * Execute an overweight message.
		 *
		 * Temporary processing errors will be propagated whereas permanent errors are treated
		 * as success condition.
		 *
		 * - `origin`: Must be `Signed`.
		 * - `message_origin`: The origin from which the message to be executed arrived.
		 * - `page`: The page in the queue in which the message to be executed is sitting.
		 * - `index`: The index into the queue of the message to be executed.
		 * - `weight_limit`: The maximum amount of weight allowed to be consumed in the execution
		 * of the message.
		 *
		 * Benchmark complexity considerations: O(index + weight_limit).
		 */
		execute_overweight: TxDescriptor<Anonymize<I1r4c2ghbtvjuc>>;
	};
	TemplatePallet: {
		/**
		 * Create a new proof-of-existence claim for the given hash.
		 *
		 * The hash must not already be claimed. The caller becomes the owner,
		 * and the current block number is recorded.
		 */
		create_claim: TxDescriptor<Anonymize<I1jm8m1rh9e20v>>;
		/**
		 * Revoke an existing proof-of-existence claim.
		 *
		 * Only the original claim owner can revoke it. The storage entry is removed.
		 */
		revoke_claim: TxDescriptor<Anonymize<I1jm8m1rh9e20v>>;
	};
	Revive: {
		/**
		 * A raw EVM transaction, typically dispatched by an Ethereum JSON-RPC server.
		 *
		 * # Parameters
		 *
		 * * `payload`: The encoded [`crate::evm::TransactionSigned`].
		 *
		 * # Note
		 *
		 * This call cannot be dispatched directly; attempting to do so will result in a failed
		 * transaction. It serves as a wrapper for an Ethereum transaction. When submitted, the
		 * runtime converts it into a [`sp_runtime::generic::CheckedExtrinsic`] by recovering the
		 * signer and validating the transaction.
		 */
		eth_transact: TxDescriptor<Anonymize<Ida37oe44osb06>>;
		/**
		 * Makes a call to an account, optionally transferring some balance.
		 *
		 * # Parameters
		 *
		 * * `dest`: Address of the contract to call.
		 * * `value`: The balance to transfer from the `origin` to `dest`.
		 * * `weight_limit`: The weight limit enforced when executing the constructor.
		 * * `storage_deposit_limit`: The maximum amount of balance that can be charged from the
		 * caller to pay for the storage consumed.
		 * * `data`: The input data to pass to the contract.
		 *
		 * * If the account is a smart-contract account, the associated code will be
		 * executed and any value will be transferred.
		 * * If the account is a regular account, any value will be transferred.
		 * * If no account exists and the call value is not less than `existential_deposit`,
		 * a regular account will be created and any value will be transferred.
		 */
		call: TxDescriptor<Anonymize<I6v02o6j4snahe>>;
		/**
		 * Instantiates a contract from a previously deployed vm binary.
		 *
		 * This function is identical to [`Self::instantiate_with_code`] but without the
		 * code deployment step. Instead, the `code_hash` of an on-chain deployed vm binary
		 * must be supplied.
		 */
		instantiate: TxDescriptor<Anonymize<I27569neuh5t1o>>;
		/**
		 * Instantiates a new contract from the supplied `code` optionally transferring
		 * some balance.
		 *
		 * This dispatchable has the same effect as calling [`Self::upload_code`] +
		 * [`Self::instantiate`]. Bundling them together provides efficiency gains. Please
		 * also check the documentation of [`Self::upload_code`].
		 *
		 * # Parameters
		 *
		 * * `value`: The balance to transfer from the `origin` to the newly created contract.
		 * * `weight_limit`: The weight limit enforced when executing the constructor.
		 * * `storage_deposit_limit`: The maximum amount of balance that can be charged/reserved
		 * from the caller to pay for the storage consumed.
		 * * `code`: The contract code to deploy in raw bytes.
		 * * `data`: The input data to pass to the contract constructor.
		 * * `salt`: Used for the address derivation. If `Some` is supplied then `CREATE2`
		 * semantics are used. If `None` then `CRATE1` is used.
		 *
		 *
		 * Instantiation is executed as follows:
		 *
		 * - The supplied `code` is deployed, and a `code_hash` is created for that code.
		 * - If the `code_hash` already exists on the chain the underlying `code` will be shared.
		 * - The destination address is computed based on the sender, code_hash and the salt.
		 * - The smart-contract account is created at the computed address.
		 * - The `value` is transferred to the new account.
		 * - The `deploy` function is executed in the context of the newly-created account.
		 */
		instantiate_with_code: TxDescriptor<Anonymize<Id92o6smntb9m5>>;
		/**
		 * Same as [`Self::instantiate_with_code`], but intended to be dispatched **only**
		 * by an EVM transaction through the EVM compatibility layer.
		 *
		 * # Parameters
		 *
		 * * `value`: The balance to transfer from the `origin` to the newly created contract.
		 * * `weight_limit`: The gas limit used to derive the transaction weight for transaction
		 * payment
		 * * `eth_gas_limit`: The Ethereum gas limit governing the resource usage of the execution
		 * * `code`: The contract code to deploy in raw bytes.
		 * * `data`: The input data to pass to the contract constructor.
		 * * `transaction_encoded`: The RLP encoding of the signed Ethereum transaction,
		 * represented as [crate::evm::TransactionSigned], provided by the Ethereum wallet. This
		 * is used for building the Ethereum transaction root.
		 * * effective_gas_price: the price of a unit of gas
		 * * encoded len: the byte code size of the `eth_transact` extrinsic
		 *
		 * Calling this dispatchable ensures that the origin's nonce is bumped only once,
		 * via the `CheckNonce` transaction extension. In contrast, [`Self::instantiate_with_code`]
		 * also bumps the nonce after contract instantiation, since it may be invoked multiple
		 * times within a batch call transaction.
		 */
		eth_instantiate_with_code: TxDescriptor<Anonymize<I5nmb2hfkgk9ol>>;
		/**
		 * Same as [`Self::call`], but intended to be dispatched **only**
		 * by an EVM transaction through the EVM compatibility layer.
		 *
		 * # Parameters
		 *
		 * * `dest`: The Ethereum address of the account to be called
		 * * `value`: The balance to transfer from the `origin` to the newly created contract.
		 * * `weight_limit`: The gas limit used to derive the transaction weight for transaction
		 * payment
		 * * `eth_gas_limit`: The Ethereum gas limit governing the resource usage of the execution
		 * * `data`: The input data to pass to the contract constructor.
		 * * `transaction_encoded`: The RLP encoding of the signed Ethereum transaction,
		 * represented as [crate::evm::TransactionSigned], provided by the Ethereum wallet. This
		 * is used for building the Ethereum transaction root.
		 * * effective_gas_price: the price of a unit of gas
		 * * encoded len: the byte code size of the `eth_transact` extrinsic
		 */
		eth_call: TxDescriptor<Anonymize<Iav55bcqlrqn51>>;
		/**
		 * Executes a Substrate runtime call from an Ethereum transaction.
		 *
		 * This dispatchable is intended to be called **only** through the EVM compatibility
		 * layer. The provided call will be dispatched using `RawOrigin::Signed`.
		 *
		 * # Parameters
		 *
		 * * `origin`: Must be an [`Origin::EthTransaction`] origin.
		 * * `call`: The Substrate runtime call to execute.
		 * * `transaction_encoded`: The RLP encoding of the Ethereum transaction,
		 */
		eth_substrate_call: TxDescriptor<Anonymize<I8rgbuguu0r385>>;
		/**
		 * Upload new `code` without instantiating a contract from it.
		 *
		 * If the code does not already exist a deposit is reserved from the caller
		 * The size of the reserve depends on the size of the supplied `code`.
		 *
		 * # Note
		 *
		 * Anyone can instantiate a contract from any uploaded code and thus prevent its removal.
		 * To avoid this situation a constructor could employ access control so that it can
		 * only be instantiated by permissioned entities. The same is true when uploading
		 * through [`Self::instantiate_with_code`].
		 *
		 * If the refcount of the code reaches zero after terminating the last contract that
		 * references this code, the code will be removed automatically.
		 */
		upload_code: TxDescriptor<Anonymize<I10ra4g1rl6k2f>>;
		/**
		 * Remove the code stored under `code_hash` and refund the deposit to its owner.
		 *
		 * A code can only be removed by its original uploader (its owner) and only if it is
		 * not used by any contract.
		 */
		remove_code: TxDescriptor<Anonymize<Ib51vk42m1po4n>>;
		/**
		 * Privileged function that changes the code of an existing contract.
		 *
		 * This takes care of updating refcounts and all other necessary operations. Returns
		 * an error if either the `code_hash` or `dest` do not exist.
		 *
		 * # Note
		 *
		 * This does **not** change the address of the contract in question. This means
		 * that the contract address is no longer derived from its code hash after calling
		 * this dispatchable.
		 */
		set_code: TxDescriptor<Anonymize<I1uihehkdsggvp>>;
		/**
		 * Register the callers account id so that it can be used in contract interactions.
		 *
		 * This will error if the origin is already mapped or is a eth native `Address20`. It will
		 * take a deposit that can be released by calling [`Self::unmap_account`].
		 */
		map_account: TxDescriptor<undefined>;
		/**
		 * Unregister the callers account id in order to free the deposit.
		 *
		 * There is no reason to ever call this function other than freeing up the deposit.
		 * This is only useful when the account should no longer be used.
		 */
		unmap_account: TxDescriptor<undefined>;
		/**
		 * Dispatch an `call` with the origin set to the callers fallback address.
		 *
		 * Every `AccountId32` can control its corresponding fallback account. The fallback account
		 * is the `AccountId20` with the last 12 bytes set to `0xEE`. This is essentially a
		 * recovery function in case an `AccountId20` was used without creating a mapping first.
		 */
		dispatch_as_fallback_account: TxDescriptor<Anonymize<Iaalag4sajqdff>>;
	};
};
type IEvent = {
	System: {
		/**
		 * An extrinsic completed successfully.
		 */
		ExtrinsicSuccess: PlainDescriptor<Anonymize<Ia82mnkmeo2rhc>>;
		/**
		 * An extrinsic failed.
		 */
		ExtrinsicFailed: PlainDescriptor<Anonymize<I1r3pbre2pbk42>>;
		/**
		 * `:code` was updated.
		 */
		CodeUpdated: PlainDescriptor<undefined>;
		/**
		 * A new account was created.
		 */
		NewAccount: PlainDescriptor<Anonymize<Icbccs0ug47ilf>>;
		/**
		 * An account was reaped.
		 */
		KilledAccount: PlainDescriptor<Anonymize<Icbccs0ug47ilf>>;
		/**
		 * On on-chain remark happened.
		 */
		Remarked: PlainDescriptor<Anonymize<I855j4i3kr8ko1>>;
		/**
		 * An upgrade was authorized.
		 */
		UpgradeAuthorized: PlainDescriptor<Anonymize<Ibgl04rn6nbfm6>>;
		/**
		 * An invalid authorized upgrade was rejected while trying to apply it.
		 */
		RejectedInvalidAuthorizedUpgrade: PlainDescriptor<Anonymize<I301j27dgc96v5>>;
	};
	ParachainSystem: {
		/**
		 * The validation function has been scheduled to apply.
		 */
		ValidationFunctionStored: PlainDescriptor<undefined>;
		/**
		 * The validation function was applied as of the contained relay chain block number.
		 */
		ValidationFunctionApplied: PlainDescriptor<Anonymize<Idd7hd99u0ho0n>>;
		/**
		 * The relay-chain aborted the upgrade process.
		 */
		ValidationFunctionDiscarded: PlainDescriptor<undefined>;
		/**
		 * Some downward messages have been received and will be processed.
		 */
		DownwardMessagesReceived: PlainDescriptor<Anonymize<Iafscmv8tjf0ou>>;
		/**
		 * Downward messages were processed using the given weight.
		 */
		DownwardMessagesProcessed: PlainDescriptor<Anonymize<I100l07kaehdlp>>;
		/**
		 * An upward message was sent to the relay chain.
		 */
		UpwardMessageSent: PlainDescriptor<Anonymize<I6gnbnvip5vvdi>>;
	};
	Balances: {
		/**
		 * An account was created with some free balance.
		 */
		Endowed: PlainDescriptor<Anonymize<Icv68aq8841478>>;
		/**
		 * An account was removed whose balance was non-zero but below ExistentialDeposit,
		 * resulting in an outright loss.
		 */
		DustLost: PlainDescriptor<Anonymize<Ic262ibdoec56a>>;
		/**
		 * Transfer succeeded.
		 */
		Transfer: PlainDescriptor<Anonymize<Iflcfm9b6nlmdd>>;
		/**
		 * A balance was set by root.
		 */
		BalanceSet: PlainDescriptor<Anonymize<Ijrsf4mnp3eka>>;
		/**
		 * Some balance was reserved (moved from free to reserved).
		 */
		Reserved: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some balance was unreserved (moved from reserved to free).
		 */
		Unreserved: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some balance was moved from the reserve of the first account to the second account.
		 * Final argument indicates the destination balance type.
		 */
		ReserveRepatriated: PlainDescriptor<Anonymize<I8tjvj9uq4b7hi>>;
		/**
		 * Some amount was deposited (e.g. for transaction fees).
		 */
		Deposit: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some amount was withdrawn from the account (e.g. for transaction fees).
		 */
		Withdraw: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some amount was removed from the account (e.g. for misbehavior).
		 */
		Slashed: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some amount was minted into an account.
		 */
		Minted: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some credit was balanced and added to the TotalIssuance.
		 */
		MintedCredit: PlainDescriptor<Anonymize<I3qt1hgg4djhgb>>;
		/**
		 * Some amount was burned from an account.
		 */
		Burned: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some debt has been dropped from the Total Issuance.
		 */
		BurnedDebt: PlainDescriptor<Anonymize<I3qt1hgg4djhgb>>;
		/**
		 * Some amount was suspended from an account (it can be restored later).
		 */
		Suspended: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some amount was restored into an account.
		 */
		Restored: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * An account was upgraded.
		 */
		Upgraded: PlainDescriptor<Anonymize<I4cbvqmqadhrea>>;
		/**
		 * Total issuance was increased by `amount`, creating a credit to be balanced.
		 */
		Issued: PlainDescriptor<Anonymize<I3qt1hgg4djhgb>>;
		/**
		 * Total issuance was decreased by `amount`, creating a debt to be balanced.
		 */
		Rescinded: PlainDescriptor<Anonymize<I3qt1hgg4djhgb>>;
		/**
		 * Some balance was locked.
		 */
		Locked: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some balance was unlocked.
		 */
		Unlocked: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some balance was frozen.
		 */
		Frozen: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * Some balance was thawed.
		 */
		Thawed: PlainDescriptor<Anonymize<Id5fm4p8lj5qgi>>;
		/**
		 * The `TotalIssuance` was forcefully changed.
		 */
		TotalIssuanceForced: PlainDescriptor<Anonymize<I4fooe9dun9o0t>>;
		/**
		 * Some balance was placed on hold.
		 */
		Held: PlainDescriptor<Anonymize<I2sjgp7v0b4kr7>>;
		/**
		 * Held balance was burned from an account.
		 */
		BurnedHeld: PlainDescriptor<Anonymize<I2sjgp7v0b4kr7>>;
		/**
		 * A transfer of `amount` on hold from `source` to `dest` was initiated.
		 */
		TransferOnHold: PlainDescriptor<Anonymize<Iq8n5b8q00vqa>>;
		/**
		 * The `transferred` balance is placed on hold at the `dest` account.
		 */
		TransferAndHold: PlainDescriptor<Anonymize<Iaa6lo6ksjs4p7>>;
		/**
		 * Some balance was released from hold.
		 */
		Released: PlainDescriptor<Anonymize<I2sjgp7v0b4kr7>>;
		/**
		 * An unexpected/defensive event was triggered.
		 */
		Unexpected: PlainDescriptor<Anonymize<Iph9c4rn81ub2>>;
	};
	TransactionPayment: {
		/**
		 * A transaction fee `actual_fee`, of which `tip` was added to the minimum inclusion fee,
		 * has been paid by `who`.
		 */
		TransactionFeePaid: PlainDescriptor<Anonymize<Ier2cke86dqbr2>>;
	};
	Sudo: {
		/**
		 * A sudo call just took place.
		 */
		Sudid: PlainDescriptor<Anonymize<Iegiuu1igi1d3c>>;
		/**
		 * The sudo key has been updated.
		 */
		KeyChanged: PlainDescriptor<Anonymize<I5rtkmhm2dng4u>>;
		/**
		 * The key was permanently removed.
		 */
		KeyRemoved: PlainDescriptor<undefined>;
		/**
		 * A [sudo_as](Pallet::sudo_as) call just took place.
		 */
		SudoAsDone: PlainDescriptor<Anonymize<Iegiuu1igi1d3c>>;
	};
	Multisig: {
		/**
		 * A new multisig operation has begun.
		 */
		NewMultisig: PlainDescriptor<Anonymize<Iep27ialq4a7o7>>;
		/**
		 * A multisig operation has been approved by someone.
		 */
		MultisigApproval: PlainDescriptor<Anonymize<Iasu5jvoqr43mv>>;
		/**
		 * A multisig operation has been executed.
		 */
		MultisigExecuted: PlainDescriptor<Anonymize<I3uo4gtrvs4i80>>;
		/**
		 * A multisig operation has been cancelled.
		 */
		MultisigCancelled: PlainDescriptor<Anonymize<I5qolde99acmd1>>;
		/**
		 * The deposit for a multisig operation has been updated/poked.
		 */
		DepositPoked: PlainDescriptor<Anonymize<I8gtde5abn1g9a>>;
	};
	CollatorSelection: {
		/**
		 * New Invulnerables were set.
		 */
		NewInvulnerables: PlainDescriptor<Anonymize<I39t01nnod9109>>;
		/**
		 * A new Invulnerable was added.
		 */
		InvulnerableAdded: PlainDescriptor<Anonymize<I6v8sm60vvkmk7>>;
		/**
		 * An Invulnerable was removed.
		 */
		InvulnerableRemoved: PlainDescriptor<Anonymize<I6v8sm60vvkmk7>>;
		/**
		 * The number of desired candidates was set.
		 */
		NewDesiredCandidates: PlainDescriptor<Anonymize<I1qmtmbe5so8r3>>;
		/**
		 * The candidacy bond was set.
		 */
		NewCandidacyBond: PlainDescriptor<Anonymize<Ih99m6ehpcar7>>;
		/**
		 * A new candidate joined.
		 */
		CandidateAdded: PlainDescriptor<Anonymize<Idgorhsbgdq2ap>>;
		/**
		 * Bond of a candidate updated.
		 */
		CandidateBondUpdated: PlainDescriptor<Anonymize<Idgorhsbgdq2ap>>;
		/**
		 * A candidate was removed.
		 */
		CandidateRemoved: PlainDescriptor<Anonymize<I6v8sm60vvkmk7>>;
		/**
		 * An account was replaced in the candidate list by another one.
		 */
		CandidateReplaced: PlainDescriptor<Anonymize<I9ubb2kqevnu6t>>;
		/**
		 * An account was unable to be added to the Invulnerables because they did not have keys
		 * registered. Other Invulnerables may have been set.
		 */
		InvalidInvulnerableSkipped: PlainDescriptor<Anonymize<I6v8sm60vvkmk7>>;
	};
	Session: {
		/**
		 * New session has happened. Note that the argument is the session index, not the
		 * block number as the type might suggest.
		 */
		NewSession: PlainDescriptor<Anonymize<I2hq50pu2kdjpo>>;
		/**
		 * The `NewSession` event in the current block also implies a new validator set to be
		 * queued.
		 */
		NewQueued: PlainDescriptor<undefined>;
		/**
		 * Validator has been disabled.
		 */
		ValidatorDisabled: PlainDescriptor<Anonymize<I9acqruh7322g2>>;
		/**
		 * Validator has been re-enabled.
		 */
		ValidatorReenabled: PlainDescriptor<Anonymize<I9acqruh7322g2>>;
	};
	XcmpQueue: {
		/**
		 * An HRMP message was sent to a sibling parachain.
		 */
		XcmpMessageSent: PlainDescriptor<Anonymize<I137t1cld92pod>>;
	};
	PolkadotXcm: {
		/**
		 * Execution of an XCM message was attempted.
		 */
		Attempted: PlainDescriptor<Anonymize<I61d51nv4cou88>>;
		/**
		 * An XCM message was sent.
		 */
		Sent: PlainDescriptor<Anonymize<If8u5kl4h8070m>>;
		/**
		 * An XCM message failed to send.
		 */
		SendFailed: PlainDescriptor<Anonymize<Ibmuil6p3vl83l>>;
		/**
		 * An XCM message failed to process.
		 */
		ProcessXcmError: PlainDescriptor<Anonymize<I7lul91g50ae87>>;
		/**
		 * Query response received which does not match a registered query. This may be because a
		 * matching query was never registered, it may be because it is a duplicate response, or
		 * because the query timed out.
		 */
		UnexpectedResponse: PlainDescriptor<Anonymize<Icl7nl1rfeog3i>>;
		/**
		 * Query response has been received and is ready for taking with `take_response`. There is
		 * no registered notification call.
		 */
		ResponseReady: PlainDescriptor<Anonymize<Iasr6pj6shs0fl>>;
		/**
		 * Query response has been received and query is removed. The registered notification has
		 * been dispatched and executed successfully.
		 */
		Notified: PlainDescriptor<Anonymize<I2uqmls7kcdnii>>;
		/**
		 * Query response has been received and query is removed. The registered notification
		 * could not be dispatched because the dispatch weight is greater than the maximum weight
		 * originally budgeted by this runtime for the query result.
		 */
		NotifyOverweight: PlainDescriptor<Anonymize<Idg69klialbkb8>>;
		/**
		 * Query response has been received and query is removed. There was a general error with
		 * dispatching the notification call.
		 */
		NotifyDispatchError: PlainDescriptor<Anonymize<I2uqmls7kcdnii>>;
		/**
		 * Query response has been received and query is removed. The dispatch was unable to be
		 * decoded into a `Call`; this might be due to dispatch function having a signature which
		 * is not `(origin, QueryId, Response)`.
		 */
		NotifyDecodeFailed: PlainDescriptor<Anonymize<I2uqmls7kcdnii>>;
		/**
		 * Expected query response has been received but the origin location of the response does
		 * not match that expected. The query remains registered for a later, valid, response to
		 * be received and acted upon.
		 */
		InvalidResponder: PlainDescriptor<Anonymize<I7r6b7145022pp>>;
		/**
		 * Expected query response has been received but the expected origin location placed in
		 * storage by this runtime previously cannot be decoded. The query remains registered.
		 *
		 * This is unexpected (since a location placed in storage in a previously executing
		 * runtime should be readable prior to query timeout) and dangerous since the possibly
		 * valid response will be dropped. Manual governance intervention is probably going to be
		 * needed.
		 */
		InvalidResponderVersion: PlainDescriptor<Anonymize<Icl7nl1rfeog3i>>;
		/**
		 * Received query response has been read and removed.
		 */
		ResponseTaken: PlainDescriptor<Anonymize<I30pg328m00nr3>>;
		/**
		 * Some assets have been placed in an asset trap.
		 */
		AssetsTrapped: PlainDescriptor<Anonymize<Icmrn7bogp28cs>>;
		/**
		 * An XCM version change notification message has been attempted to be sent.
		 *
		 * The cost of sending it (borne by the chain) is included.
		 */
		VersionChangeNotified: PlainDescriptor<Anonymize<I7m9b5plj4h5ot>>;
		/**
		 * The supported version of a location has been changed. This might be through an
		 * automatic notification or a manual intervention.
		 */
		SupportedVersionChanged: PlainDescriptor<Anonymize<I9kt8c221c83ln>>;
		/**
		 * A given location which had a version change subscription was dropped owing to an error
		 * sending the notification to it.
		 */
		NotifyTargetSendFail: PlainDescriptor<Anonymize<I9onhk772nfs4f>>;
		/**
		 * A given location which had a version change subscription was dropped owing to an error
		 * migrating the location to our new XCM format.
		 */
		NotifyTargetMigrationFail: PlainDescriptor<Anonymize<I3l6bnksrmt56r>>;
		/**
		 * Expected query response has been received but the expected querier location placed in
		 * storage by this runtime previously cannot be decoded. The query remains registered.
		 *
		 * This is unexpected (since a location placed in storage in a previously executing
		 * runtime should be readable prior to query timeout) and dangerous since the possibly
		 * valid response will be dropped. Manual governance intervention is probably going to be
		 * needed.
		 */
		InvalidQuerierVersion: PlainDescriptor<Anonymize<Icl7nl1rfeog3i>>;
		/**
		 * Expected query response has been received but the querier location of the response does
		 * not match the expected. The query remains registered for a later, valid, response to
		 * be received and acted upon.
		 */
		InvalidQuerier: PlainDescriptor<Anonymize<Idh09k0l2pmdcg>>;
		/**
		 * A remote has requested XCM version change notification from us and we have honored it.
		 * A version information message is sent to them and its cost is included.
		 */
		VersionNotifyStarted: PlainDescriptor<Anonymize<I7uoiphbm0tj4r>>;
		/**
		 * We have requested that a remote chain send us XCM version change notifications.
		 */
		VersionNotifyRequested: PlainDescriptor<Anonymize<I7uoiphbm0tj4r>>;
		/**
		 * We have requested that a remote chain stops sending us XCM version change
		 * notifications.
		 */
		VersionNotifyUnrequested: PlainDescriptor<Anonymize<I7uoiphbm0tj4r>>;
		/**
		 * Fees were paid from a location for an operation (often for using `SendXcm`).
		 */
		FeesPaid: PlainDescriptor<Anonymize<I512p1n7qt24l8>>;
		/**
		 * Some assets have been claimed from an asset trap
		 */
		AssetsClaimed: PlainDescriptor<Anonymize<Icmrn7bogp28cs>>;
		/**
		 * A XCM version migration finished.
		 */
		VersionMigrationFinished: PlainDescriptor<Anonymize<I6s1nbislhk619>>;
		/**
		 * An `aliaser` location was authorized by `target` to alias it, authorization valid until
		 * `expiry` block number.
		 */
		AliasAuthorized: PlainDescriptor<Anonymize<I3gghqnh2mj0is>>;
		/**
		 * `target` removed alias authorization for `aliaser`.
		 */
		AliasAuthorizationRemoved: PlainDescriptor<Anonymize<I6iv852roh6t3h>>;
		/**
		 * `target` removed all alias authorizations.
		 */
		AliasesAuthorizationsRemoved: PlainDescriptor<Anonymize<I9oc2o6itbiopq>>;
	};
	CumulusXcm: {
		/**
		 * Downward message is invalid XCM.
		 * \[ id \]
		 */
		InvalidFormat: PlainDescriptor<FixedSizeBinary<32>>;
		/**
		 * Downward message is unsupported version of XCM.
		 * \[ id \]
		 */
		UnsupportedVersion: PlainDescriptor<FixedSizeBinary<32>>;
		/**
		 * Downward message executed with the given outcome.
		 * \[ id, outcome \]
		 */
		ExecutedDownward: PlainDescriptor<Anonymize<Ibslgga81p36aa>>;
	};
	MessageQueue: {
		/**
		 * Message discarded due to an error in the `MessageProcessor` (usually a format error).
		 */
		ProcessingFailed: PlainDescriptor<Anonymize<I1rvj4ubaplho0>>;
		/**
		 * Message is processed.
		 */
		Processed: PlainDescriptor<Anonymize<Ia3uu7lqcc1q1i>>;
		/**
		 * Message placed in overweight queue.
		 */
		OverweightEnqueued: PlainDescriptor<Anonymize<I7crucfnonitkn>>;
		/**
		 * This page was reaped.
		 */
		PageReaped: PlainDescriptor<Anonymize<I7tmrp94r9sq4n>>;
	};
	Statement: {
		/**
		 * A new statement is submitted
		 */
		NewStatement: PlainDescriptor<Anonymize<I3uua81e9uvgnp>>;
	};
	TemplatePallet: {
		/**
		 * A new claim was created.
		 */
		ClaimCreated: PlainDescriptor<Anonymize<I9p6tgcfbrrlod>>;
		/**
		 * A claim was revoked by its owner.
		 */
		ClaimRevoked: PlainDescriptor<Anonymize<I9p6tgcfbrrlod>>;
	};
	Revive: {
		/**
		 * A custom event emitted by the contract.
		 */
		ContractEmitted: PlainDescriptor<Anonymize<I7svbvm6hg57aj>>;
		/**
		 * Contract deployed by deployer at the specified address.
		 */
		Instantiated: PlainDescriptor<Anonymize<I8jhsbaiultviu>>;
		/**
		 * Emitted when an Ethereum transaction reverts.
		 *
		 * Ethereum transactions always complete successfully at the extrinsic level,
		 * as even reverted calls must store their `ReceiptInfo`.
		 * To distinguish reverted calls from successful ones, this event is emitted
		 * for failed Ethereum transactions.
		 */
		EthExtrinsicRevert: PlainDescriptor<Anonymize<Idrmne02mqlgti>>;
	};
};
type IError = {
	System: {
		/**
		 * The name of specification does not match between the current runtime
		 * and the new runtime.
		 */
		InvalidSpecName: PlainDescriptor<undefined>;
		/**
		 * The specification version is not allowed to decrease between the current runtime
		 * and the new runtime.
		 */
		SpecVersionNeedsToIncrease: PlainDescriptor<undefined>;
		/**
		 * Failed to extract the runtime version from the new runtime.
		 *
		 * Either calling `Core_version` or decoding `RuntimeVersion` failed.
		 */
		FailedToExtractRuntimeVersion: PlainDescriptor<undefined>;
		/**
		 * Suicide called when the account has non-default composite data.
		 */
		NonDefaultComposite: PlainDescriptor<undefined>;
		/**
		 * There is a non-zero reference count preventing the account from being purged.
		 */
		NonZeroRefCount: PlainDescriptor<undefined>;
		/**
		 * The origin filter prevent the call to be dispatched.
		 */
		CallFiltered: PlainDescriptor<undefined>;
		/**
		 * A multi-block migration is ongoing and prevents the current code from being replaced.
		 */
		MultiBlockMigrationsOngoing: PlainDescriptor<undefined>;
		/**
		 * No upgrade authorized.
		 */
		NothingAuthorized: PlainDescriptor<undefined>;
		/**
		 * The submitted code is not authorized.
		 */
		Unauthorized: PlainDescriptor<undefined>;
	};
	ParachainSystem: {
		/**
		 * Attempt to upgrade validation function while existing upgrade pending.
		 */
		OverlappingUpgrades: PlainDescriptor<undefined>;
		/**
		 * Polkadot currently prohibits this parachain from upgrading its validation function.
		 */
		ProhibitedByPolkadot: PlainDescriptor<undefined>;
		/**
		 * The supplied validation function has compiled into a blob larger than Polkadot is
		 * willing to run.
		 */
		TooBig: PlainDescriptor<undefined>;
		/**
		 * The inherent which supplies the validation data did not run this block.
		 */
		ValidationDataNotAvailable: PlainDescriptor<undefined>;
		/**
		 * The inherent which supplies the host configuration did not run this block.
		 */
		HostConfigurationNotAvailable: PlainDescriptor<undefined>;
		/**
		 * No validation function upgrade is currently scheduled.
		 */
		NotScheduled: PlainDescriptor<undefined>;
	};
	Balances: {
		/**
		 * Vesting balance too high to send value.
		 */
		VestingBalance: PlainDescriptor<undefined>;
		/**
		 * Account liquidity restrictions prevent withdrawal.
		 */
		LiquidityRestrictions: PlainDescriptor<undefined>;
		/**
		 * Balance too low to send value.
		 */
		InsufficientBalance: PlainDescriptor<undefined>;
		/**
		 * Value too low to create account due to existential deposit.
		 */
		ExistentialDeposit: PlainDescriptor<undefined>;
		/**
		 * Transfer/payment would kill account.
		 */
		Expendability: PlainDescriptor<undefined>;
		/**
		 * A vesting schedule already exists for this account.
		 */
		ExistingVestingSchedule: PlainDescriptor<undefined>;
		/**
		 * Beneficiary account must pre-exist.
		 */
		DeadAccount: PlainDescriptor<undefined>;
		/**
		 * Number of named reserves exceed `MaxReserves`.
		 */
		TooManyReserves: PlainDescriptor<undefined>;
		/**
		 * Number of holds exceed `VariantCountOf<T::RuntimeHoldReason>`.
		 */
		TooManyHolds: PlainDescriptor<undefined>;
		/**
		 * Number of freezes exceed `MaxFreezes`.
		 */
		TooManyFreezes: PlainDescriptor<undefined>;
		/**
		 * The issuance cannot be modified since it is already deactivated.
		 */
		IssuanceDeactivated: PlainDescriptor<undefined>;
		/**
		 * The delta cannot be zero.
		 */
		DeltaZero: PlainDescriptor<undefined>;
	};
	Sudo: {
		/**
		 * Sender must be the Sudo account.
		 */
		RequireSudo: PlainDescriptor<undefined>;
	};
	Multisig: {
		/**
		 * Threshold must be 2 or greater.
		 */
		MinimumThreshold: PlainDescriptor<undefined>;
		/**
		 * Call is already approved by this signatory.
		 */
		AlreadyApproved: PlainDescriptor<undefined>;
		/**
		 * Call doesn't need any (more) approvals.
		 */
		NoApprovalsNeeded: PlainDescriptor<undefined>;
		/**
		 * There are too few signatories in the list.
		 */
		TooFewSignatories: PlainDescriptor<undefined>;
		/**
		 * There are too many signatories in the list.
		 */
		TooManySignatories: PlainDescriptor<undefined>;
		/**
		 * The signatories were provided out of order; they should be ordered.
		 */
		SignatoriesOutOfOrder: PlainDescriptor<undefined>;
		/**
		 * The sender was contained in the other signatories; it shouldn't be.
		 */
		SenderInSignatories: PlainDescriptor<undefined>;
		/**
		 * Multisig operation not found in storage.
		 */
		NotFound: PlainDescriptor<undefined>;
		/**
		 * Only the account that originally created the multisig is able to cancel it or update
		 * its deposits.
		 */
		NotOwner: PlainDescriptor<undefined>;
		/**
		 * No timepoint was given, yet the multisig operation is already underway.
		 */
		NoTimepoint: PlainDescriptor<undefined>;
		/**
		 * A different timepoint was given to the multisig operation that is underway.
		 */
		WrongTimepoint: PlainDescriptor<undefined>;
		/**
		 * A timepoint was given, yet no multisig operation is underway.
		 */
		UnexpectedTimepoint: PlainDescriptor<undefined>;
		/**
		 * The maximum weight information provided was too low.
		 */
		MaxWeightTooLow: PlainDescriptor<undefined>;
		/**
		 * The data to be stored is already stored.
		 */
		AlreadyStored: PlainDescriptor<undefined>;
	};
	CollatorSelection: {
		/**
		 * The pallet has too many candidates.
		 */
		TooManyCandidates: PlainDescriptor<undefined>;
		/**
		 * Leaving would result in too few candidates.
		 */
		TooFewEligibleCollators: PlainDescriptor<undefined>;
		/**
		 * Account is already a candidate.
		 */
		AlreadyCandidate: PlainDescriptor<undefined>;
		/**
		 * Account is not a candidate.
		 */
		NotCandidate: PlainDescriptor<undefined>;
		/**
		 * There are too many Invulnerables.
		 */
		TooManyInvulnerables: PlainDescriptor<undefined>;
		/**
		 * Account is already an Invulnerable.
		 */
		AlreadyInvulnerable: PlainDescriptor<undefined>;
		/**
		 * Account is not an Invulnerable.
		 */
		NotInvulnerable: PlainDescriptor<undefined>;
		/**
		 * Account has no associated validator ID.
		 */
		NoAssociatedValidatorId: PlainDescriptor<undefined>;
		/**
		 * Validator ID is not yet registered.
		 */
		ValidatorNotRegistered: PlainDescriptor<undefined>;
		/**
		 * Could not insert in the candidate list.
		 */
		InsertToCandidateListFailed: PlainDescriptor<undefined>;
		/**
		 * Could not remove from the candidate list.
		 */
		RemoveFromCandidateListFailed: PlainDescriptor<undefined>;
		/**
		 * New deposit amount would be below the minimum candidacy bond.
		 */
		DepositTooLow: PlainDescriptor<undefined>;
		/**
		 * Could not update the candidate list.
		 */
		UpdateCandidateListFailed: PlainDescriptor<undefined>;
		/**
		 * Deposit amount is too low to take the target's slot in the candidate list.
		 */
		InsufficientBond: PlainDescriptor<undefined>;
		/**
		 * The target account to be replaced in the candidate list is not a candidate.
		 */
		TargetIsNotCandidate: PlainDescriptor<undefined>;
		/**
		 * The updated deposit amount is equal to the amount already reserved.
		 */
		IdenticalDeposit: PlainDescriptor<undefined>;
		/**
		 * Cannot lower candidacy bond while occupying a future collator slot in the list.
		 */
		InvalidUnreserve: PlainDescriptor<undefined>;
	};
	Session: {
		/**
		 * Invalid ownership proof.
		 */
		InvalidProof: PlainDescriptor<undefined>;
		/**
		 * No associated validator ID for account.
		 */
		NoAssociatedValidatorId: PlainDescriptor<undefined>;
		/**
		 * Registered duplicate key.
		 */
		DuplicatedKey: PlainDescriptor<undefined>;
		/**
		 * No keys are associated with this account.
		 */
		NoKeys: PlainDescriptor<undefined>;
		/**
		 * Key setting account is not live, so it's impossible to associate keys.
		 */
		NoAccount: PlainDescriptor<undefined>;
	};
	XcmpQueue: {
		/**
		 * Setting the queue config failed since one of its values was invalid.
		 */
		BadQueueConfig: PlainDescriptor<undefined>;
		/**
		 * The execution is already suspended.
		 */
		AlreadySuspended: PlainDescriptor<undefined>;
		/**
		 * The execution is already resumed.
		 */
		AlreadyResumed: PlainDescriptor<undefined>;
		/**
		 * There are too many active outbound channels.
		 */
		TooManyActiveOutboundChannels: PlainDescriptor<undefined>;
		/**
		 * The message is too big.
		 */
		TooBig: PlainDescriptor<undefined>;
	};
	PolkadotXcm: {
		/**
		 * The desired destination was unreachable, generally because there is a no way of routing
		 * to it.
		 */
		Unreachable: PlainDescriptor<undefined>;
		/**
		 * There was some other issue (i.e. not to do with routing) in sending the message.
		 * Perhaps a lack of space for buffering the message.
		 */
		SendFailure: PlainDescriptor<undefined>;
		/**
		 * The message execution fails the filter.
		 */
		Filtered: PlainDescriptor<undefined>;
		/**
		 * The message's weight could not be determined.
		 */
		UnweighableMessage: PlainDescriptor<undefined>;
		/**
		 * The destination `Location` provided cannot be inverted.
		 */
		DestinationNotInvertible: PlainDescriptor<undefined>;
		/**
		 * The assets to be sent are empty.
		 */
		Empty: PlainDescriptor<undefined>;
		/**
		 * Could not re-anchor the assets to declare the fees for the destination chain.
		 */
		CannotReanchor: PlainDescriptor<undefined>;
		/**
		 * Too many assets have been attempted for transfer.
		 */
		TooManyAssets: PlainDescriptor<undefined>;
		/**
		 * Origin is invalid for sending.
		 */
		InvalidOrigin: PlainDescriptor<undefined>;
		/**
		 * The version of the `Versioned` value used is not able to be interpreted.
		 */
		BadVersion: PlainDescriptor<undefined>;
		/**
		 * The given location could not be used (e.g. because it cannot be expressed in the
		 * desired version of XCM).
		 */
		BadLocation: PlainDescriptor<undefined>;
		/**
		 * The referenced subscription could not be found.
		 */
		NoSubscription: PlainDescriptor<undefined>;
		/**
		 * The location is invalid since it already has a subscription from us.
		 */
		AlreadySubscribed: PlainDescriptor<undefined>;
		/**
		 * Could not check-out the assets for teleportation to the destination chain.
		 */
		CannotCheckOutTeleport: PlainDescriptor<undefined>;
		/**
		 * The owner does not own (all) of the asset that they wish to do the operation on.
		 */
		LowBalance: PlainDescriptor<undefined>;
		/**
		 * The asset owner has too many locks on the asset.
		 */
		TooManyLocks: PlainDescriptor<undefined>;
		/**
		 * The given account is not an identifiable sovereign account for any location.
		 */
		AccountNotSovereign: PlainDescriptor<undefined>;
		/**
		 * The operation required fees to be paid which the initiator could not meet.
		 */
		FeesNotMet: PlainDescriptor<undefined>;
		/**
		 * A remote lock with the corresponding data could not be found.
		 */
		LockNotFound: PlainDescriptor<undefined>;
		/**
		 * The unlock operation cannot succeed because there are still consumers of the lock.
		 */
		InUse: PlainDescriptor<undefined>;
		/**
		 * Invalid asset, reserve chain could not be determined for it.
		 */
		InvalidAssetUnknownReserve: PlainDescriptor<undefined>;
		/**
		 * Invalid asset, do not support remote asset reserves with different fees reserves.
		 */
		InvalidAssetUnsupportedReserve: PlainDescriptor<undefined>;
		/**
		 * Too many assets with different reserve locations have been attempted for transfer.
		 */
		TooManyReserves: PlainDescriptor<undefined>;
		/**
		 * Local XCM execution incomplete.
		 */
		LocalExecutionIncomplete: PlainDescriptor<undefined>;
		/**
		 * Too many locations authorized to alias origin.
		 */
		TooManyAuthorizedAliases: PlainDescriptor<undefined>;
		/**
		 * Expiry block number is in the past.
		 */
		ExpiresInPast: PlainDescriptor<undefined>;
		/**
		 * The alias to remove authorization for was not found.
		 */
		AliasNotFound: PlainDescriptor<undefined>;
		/**
		 * Local XCM execution incomplete with the actual XCM error and the index of the
		 * instruction that caused the error.
		 */
		LocalExecutionIncompleteWithError: PlainDescriptor<Anonymize<I5r8t4iaend96p>>;
	};
	MessageQueue: {
		/**
		 * Page is not reapable because it has items remaining to be processed and is not old
		 * enough.
		 */
		NotReapable: PlainDescriptor<undefined>;
		/**
		 * Page to be reaped does not exist.
		 */
		NoPage: PlainDescriptor<undefined>;
		/**
		 * The referenced message could not be found.
		 */
		NoMessage: PlainDescriptor<undefined>;
		/**
		 * The message was already processed and cannot be processed again.
		 */
		AlreadyProcessed: PlainDescriptor<undefined>;
		/**
		 * The message is queued for future execution.
		 */
		Queued: PlainDescriptor<undefined>;
		/**
		 * There is temporarily not enough weight to continue servicing messages.
		 */
		InsufficientWeight: PlainDescriptor<undefined>;
		/**
		 * This message is temporarily unprocessable.
		 *
		 * Such errors are expected, but not guaranteed, to resolve themselves eventually through
		 * retrying.
		 */
		TemporarilyUnprocessable: PlainDescriptor<undefined>;
		/**
		 * The queue is paused and no message can be executed from it.
		 *
		 * This can change at any time and may resolve in the future by re-trying.
		 */
		QueuePaused: PlainDescriptor<undefined>;
		/**
		 * Another call is in progress and needs to finish before this call can happen.
		 */
		RecursiveDisallowed: PlainDescriptor<undefined>;
	};
	TemplatePallet: {
		/**
		 * This hash has already been claimed.
		 */
		AlreadyClaimed: PlainDescriptor<undefined>;
		/**
		 * The caller is not the owner of this claim.
		 */
		NotClaimOwner: PlainDescriptor<undefined>;
		/**
		 * No claim exists for this hash.
		 */
		ClaimNotFound: PlainDescriptor<undefined>;
	};
	Revive: {
		/**
		 * Invalid schedule supplied, e.g. with zero weight of a basic operation.
		 */
		InvalidSchedule: PlainDescriptor<undefined>;
		/**
		 * Invalid combination of flags supplied to `seal_call` or `seal_delegate_call`.
		 */
		InvalidCallFlags: PlainDescriptor<undefined>;
		/**
		 * The executed contract exhausted its gas limit.
		 */
		OutOfGas: PlainDescriptor<undefined>;
		/**
		 * Performing the requested transfer failed. Probably because there isn't enough
		 * free balance in the sender's account.
		 */
		TransferFailed: PlainDescriptor<undefined>;
		/**
		 * Performing a call was denied because the calling depth reached the limit
		 * of what is specified in the schedule.
		 */
		MaxCallDepthReached: PlainDescriptor<undefined>;
		/**
		 * No contract was found at the specified address.
		 */
		ContractNotFound: PlainDescriptor<undefined>;
		/**
		 * No code could be found at the supplied code hash.
		 */
		CodeNotFound: PlainDescriptor<undefined>;
		/**
		 * No code info could be found at the supplied code hash.
		 */
		CodeInfoNotFound: PlainDescriptor<undefined>;
		/**
		 * A buffer outside of sandbox memory was passed to a contract API function.
		 */
		OutOfBounds: PlainDescriptor<undefined>;
		/**
		 * Input passed to a contract API function failed to decode as expected type.
		 */
		DecodingFailed: PlainDescriptor<undefined>;
		/**
		 * Contract trapped during execution.
		 */
		ContractTrapped: PlainDescriptor<undefined>;
		/**
		 * Event body or storage item exceeds [`limits::STORAGE_BYTES`].
		 */
		ValueTooLarge: PlainDescriptor<undefined>;
		/**
		 * Termination of a contract is not allowed while the contract is already
		 * on the call stack. Can be triggered by `seal_terminate`.
		 */
		TerminatedWhileReentrant: PlainDescriptor<undefined>;
		/**
		 * `seal_call` forwarded this contracts input. It therefore is no longer available.
		 */
		InputForwarded: PlainDescriptor<undefined>;
		/**
		 * The amount of topics passed to `seal_deposit_events` exceeds the limit.
		 */
		TooManyTopics: PlainDescriptor<undefined>;
		/**
		 * A contract with the same AccountId already exists.
		 */
		DuplicateContract: PlainDescriptor<undefined>;
		/**
		 * A contract self destructed in its constructor.
		 *
		 * This can be triggered by a call to `seal_terminate`.
		 */
		TerminatedInConstructor: PlainDescriptor<undefined>;
		/**
		 * A call tried to invoke a contract that is flagged as non-reentrant.
		 */
		ReentranceDenied: PlainDescriptor<undefined>;
		/**
		 * A contract called into the runtime which then called back into this pallet.
		 */
		ReenteredPallet: PlainDescriptor<undefined>;
		/**
		 * A contract attempted to invoke a state modifying API while being in read-only mode.
		 */
		StateChangeDenied: PlainDescriptor<undefined>;
		/**
		 * Origin doesn't have enough balance to pay the required storage deposits.
		 */
		StorageDepositNotEnoughFunds: PlainDescriptor<undefined>;
		/**
		 * More storage was created than allowed by the storage deposit limit.
		 */
		StorageDepositLimitExhausted: PlainDescriptor<undefined>;
		/**
		 * Code removal was denied because the code is still in use by at least one contract.
		 */
		CodeInUse: PlainDescriptor<undefined>;
		/**
		 * The contract ran to completion but decided to revert its storage changes.
		 * Please note that this error is only returned from extrinsics. When called directly
		 * or via RPC an `Ok` will be returned. In this case the caller needs to inspect the flags
		 * to determine whether a reversion has taken place.
		 */
		ContractReverted: PlainDescriptor<undefined>;
		/**
		 * The contract failed to compile or is missing the correct entry points.
		 *
		 * A more detailed error can be found on the node console if debug messages are enabled
		 * by supplying `-lruntime::revive=debug`.
		 */
		CodeRejected: PlainDescriptor<undefined>;
		/**
		 * The code blob supplied is larger than [`limits::code::BLOB_BYTES`].
		 */
		BlobTooLarge: PlainDescriptor<undefined>;
		/**
		 * The contract declares too much memory (ro + rw + stack).
		 */
		StaticMemoryTooLarge: PlainDescriptor<undefined>;
		/**
		 * The program contains a basic block that is larger than allowed.
		 */
		BasicBlockTooLarge: PlainDescriptor<undefined>;
		/**
		 * The program contains an invalid instruction.
		 */
		InvalidInstruction: PlainDescriptor<undefined>;
		/**
		 * The contract has reached its maximum number of delegate dependencies.
		 */
		MaxDelegateDependenciesReached: PlainDescriptor<undefined>;
		/**
		 * The dependency was not found in the contract's delegate dependencies.
		 */
		DelegateDependencyNotFound: PlainDescriptor<undefined>;
		/**
		 * The contract already depends on the given delegate dependency.
		 */
		DelegateDependencyAlreadyExists: PlainDescriptor<undefined>;
		/**
		 * Can not add a delegate dependency to the code hash of the contract itself.
		 */
		CannotAddSelfAsDelegateDependency: PlainDescriptor<undefined>;
		/**
		 * Can not add more data to transient storage.
		 */
		OutOfTransientStorage: PlainDescriptor<undefined>;
		/**
		 * The contract tried to call a syscall which does not exist (at its current api level).
		 */
		InvalidSyscall: PlainDescriptor<undefined>;
		/**
		 * Invalid storage flags were passed to one of the storage syscalls.
		 */
		InvalidStorageFlags: PlainDescriptor<undefined>;
		/**
		 * PolkaVM failed during code execution. Probably due to a malformed program.
		 */
		ExecutionFailed: PlainDescriptor<undefined>;
		/**
		 * Failed to convert a U256 to a Balance.
		 */
		BalanceConversionFailed: PlainDescriptor<undefined>;
		/**
		 * Immutable data can only be set during deploys and only be read during calls.
		 * Additionally, it is only valid to set the data once and it must not be empty.
		 */
		InvalidImmutableAccess: PlainDescriptor<undefined>;
		/**
		 * An `AccountID32` account tried to interact with the pallet without having a mapping.
		 *
		 * Call [`Pallet::map_account`] in order to create a mapping for the account.
		 */
		AccountUnmapped: PlainDescriptor<undefined>;
		/**
		 * Tried to map an account that is already mapped.
		 */
		AccountAlreadyMapped: PlainDescriptor<undefined>;
		/**
		 * The transaction used to dry-run a contract is invalid.
		 */
		InvalidGenericTransaction: PlainDescriptor<undefined>;
		/**
		 * The refcount of a code either over or underflowed.
		 */
		RefcountOverOrUnderflow: PlainDescriptor<undefined>;
		/**
		 * Unsupported precompile address.
		 */
		UnsupportedPrecompileAddress: PlainDescriptor<undefined>;
		/**
		 * The calldata exceeds [`limits::CALLDATA_BYTES`].
		 */
		CallDataTooLarge: PlainDescriptor<undefined>;
		/**
		 * The return data exceeds [`limits::CALLDATA_BYTES`].
		 */
		ReturnDataTooLarge: PlainDescriptor<undefined>;
		/**
		 * Invalid jump destination. Dynamic jumps points to invalid not jumpdest opcode.
		 */
		InvalidJump: PlainDescriptor<undefined>;
		/**
		 * Attempting to pop a value from an empty stack.
		 */
		StackUnderflow: PlainDescriptor<undefined>;
		/**
		 * Attempting to push a value onto a full stack.
		 */
		StackOverflow: PlainDescriptor<undefined>;
		/**
		 * Too much deposit was drawn from the shared txfee and deposit credit.
		 *
		 * This happens if the passed `gas` inside the ethereum transaction is too low.
		 */
		TxFeeOverdraw: PlainDescriptor<undefined>;
		/**
		 * When calling an EVM constructor `data` has to be empty.
		 *
		 * EVM constructors do not accept data. Their input data is part of the code blob itself.
		 */
		EvmConstructorNonEmptyData: PlainDescriptor<undefined>;
		/**
		 * Tried to construct an EVM contract via code hash.
		 *
		 * EVM contracts can only be instantiated via code upload as no initcode is
		 * stored on-chain.
		 */
		EvmConstructedFromHash: PlainDescriptor<undefined>;
		/**
		 * The contract does not have enough balance to refund the storage deposit.
		 *
		 * This is a bug and should never happen. It means the accounting got out of sync.
		 */
		StorageRefundNotEnoughFunds: PlainDescriptor<undefined>;
		/**
		 * This means there are locks on the contracts storage deposit that prevents refunding it.
		 *
		 * This would be the case if the contract used its storage deposits for governance
		 * or other pallets that allow creating locks over held balance.
		 */
		StorageRefundLocked: PlainDescriptor<undefined>;
		/**
		 * Called a pre-compile that is not allowed to be delegate called.
		 *
		 * Some pre-compile functions will trap the caller context if being delegate
		 * called or if their caller was being delegate called.
		 */
		PrecompileDelegateDenied: PlainDescriptor<undefined>;
		/**
		 * ECDSA public key recovery failed. Most probably wrong recovery id or signature.
		 */
		EcdsaRecoveryFailed: PlainDescriptor<undefined>;
	};
};
type IConstants = {
	System: {
		/**
		 * Block & extrinsics weights: base values and limits.
		 */
		BlockWeights: PlainDescriptor<Anonymize<In7a38730s6qs>>;
		/**
		 * The maximum length of a block (in bytes).
		 */
		BlockLength: PlainDescriptor<Anonymize<If15el53dd76v9>>;
		/**
		 * Maximum number of block number to block hash mappings to keep (oldest pruned first).
		 */
		BlockHashCount: PlainDescriptor<number>;
		/**
		 * The weight of runtime database operations the runtime can invoke.
		 */
		DbWeight: PlainDescriptor<Anonymize<I9s0ave7t0vnrk>>;
		/**
		 * Get the chain's in-code version.
		 */
		Version: PlainDescriptor<Anonymize<I4fo08joqmcqnm>>;
		/**
		 * The designated SS58 prefix of this chain.
		 *
		 * This replaces the "ss58Format" property declared in the chain spec. Reason is
		 * that the runtime should know about the prefix in order to make use of it as
		 * an identifier of the chain.
		 */
		SS58Prefix: PlainDescriptor<number>;
	};
	ParachainSystem: {
		/**
		 * Returns the parachain ID we are running with.
		 */
		SelfParaId: PlainDescriptor<number>;
	};
	Timestamp: {
		/**
		 * The minimum period between blocks.
		 *
		 * Be aware that this is different to the *expected* period that the block production
		 * apparatus provides. Your chosen consensus system will generally work with this to
		 * determine a sensible block time. For example, in the Aura pallet it will be double this
		 * period on default settings.
		 */
		MinimumPeriod: PlainDescriptor<bigint>;
	};
	Balances: {
		/**
		 * The minimum amount required to keep an account open. MUST BE GREATER THAN ZERO!
		 *
		 * If you *really* need it to be zero, you can enable the feature `insecure_zero_ed` for
		 * this pallet. However, you do so at your own risk: this will open up a major DoS vector.
		 * In case you have multiple sources of provider references, you may also get unexpected
		 * behaviour if you set this to zero.
		 *
		 * Bottom line: Do yourself a favour and make it at least one!
		 */
		ExistentialDeposit: PlainDescriptor<bigint>;
		/**
		 * The maximum number of locks that should exist on an account.
		 * Not strictly enforced, but used for weight estimation.
		 *
		 * Use of locks is deprecated in favour of freezes. See `https://github.com/paritytech/substrate/pull/12951/`
		 */
		MaxLocks: PlainDescriptor<number>;
		/**
		 * The maximum number of named reserves that can exist on an account.
		 *
		 * Use of reserves is deprecated in favour of holds. See `https://github.com/paritytech/substrate/pull/12951/`
		 */
		MaxReserves: PlainDescriptor<number>;
		/**
		 * The maximum number of individual freeze locks that can exist on an account at any time.
		 */
		MaxFreezes: PlainDescriptor<number>;
	};
	TransactionPayment: {
		/**
		 * A fee multiplier for `Operational` extrinsics to compute "virtual tip" to boost their
		 * `priority`
		 *
		 * This value is multiplied by the `final_fee` to obtain a "virtual tip" that is later
		 * added to a tip component in regular `priority` calculations.
		 * It means that a `Normal` transaction can front-run a similarly-sized `Operational`
		 * extrinsic (with no tip), by including a tip value greater than the virtual tip.
		 *
		 * ```rust,ignore
		 * // For `Normal`
		 * let priority = priority_calc(tip);
		 *
		 * // For `Operational`
		 * let virtual_tip = (inclusion_fee + tip) * OperationalFeeMultiplier;
		 * let priority = priority_calc(tip + virtual_tip);
		 * ```
		 *
		 * Note that since we use `final_fee` the multiplier applies also to the regular `tip`
		 * sent with the transaction. So, not only does the transaction get a priority bump based
		 * on the `inclusion_fee`, but we also amplify the impact of tips applied to `Operational`
		 * transactions.
		 */
		OperationalFeeMultiplier: PlainDescriptor<number>;
	};
	Multisig: {
		/**
		 * The base amount of currency needed to reserve for creating a multisig execution or to
		 * store a dispatch call for later.
		 *
		 * This is held for an additional storage item whose value size is
		 * `4 + sizeof((BlockNumber, Balance, AccountId))` bytes and whose key size is
		 * `32 + sizeof(AccountId)` bytes.
		 */
		DepositBase: PlainDescriptor<bigint>;
		/**
		 * The amount of currency needed per unit threshold when creating a multisig execution.
		 *
		 * This is held for adding 32 bytes more into a pre-existing storage value.
		 */
		DepositFactor: PlainDescriptor<bigint>;
		/**
		 * The maximum amount of signatories allowed in the multisig.
		 */
		MaxSignatories: PlainDescriptor<number>;
	};
	CollatorSelection: {
		/**
		 * Account Identifier from which the internal Pot is generated.
		 */
		PotId: PlainDescriptor<FixedSizeBinary<8>>;
		/**
		 * Maximum number of candidates that we should have.
		 *
		 * This does not take into account the invulnerables.
		 */
		MaxCandidates: PlainDescriptor<number>;
		/**
		 * Minimum number eligible collators. Should always be greater than zero. This includes
		 * Invulnerable collators. This ensures that there will always be one collator who can
		 * produce a block.
		 */
		MinEligibleCollators: PlainDescriptor<number>;
		/**
		 * Maximum number of invulnerables.
		 */
		MaxInvulnerables: PlainDescriptor<number>;
		/**
        
         */
		KickThreshold: PlainDescriptor<number>;
		/**
		 * Gets this pallet's derived pot account.
		 */
		pot_account: PlainDescriptor<SS58String>;
	};
	Session: {
		/**
		 * The amount to be held when setting keys.
		 */
		KeyDeposit: PlainDescriptor<bigint>;
	};
	Aura: {
		/**
		 * The slot duration Aura should run with, expressed in milliseconds.
		 * The effective value of this type should not change while the chain is running.
		 *
		 * For backwards compatibility either use [`MinimumPeriodTimesTwo`] or a const.
		 */
		SlotDuration: PlainDescriptor<bigint>;
	};
	XcmpQueue: {
		/**
		 * The maximum number of inbound XCMP channels that can be suspended simultaneously.
		 *
		 * Any further channel suspensions will fail and messages may get dropped without further
		 * notice. Choosing a high value (1000) is okay; the trade-off that is described in
		 * [`InboundXcmpSuspended`] still applies at that scale.
		 */
		MaxInboundSuspended: PlainDescriptor<number>;
		/**
		 * Maximal number of outbound XCMP channels that can have messages queued at the same time.
		 *
		 * If this is reached, then no further messages can be sent to channels that do not yet
		 * have a message queued. This should be set to the expected maximum of outbound channels
		 * which is determined by [`Self::ChannelInfo`]. It is important to set this large enough,
		 * since otherwise the congestion control protocol will not work as intended and messages
		 * may be dropped. This value increases the PoV and should therefore not be picked too
		 * high. Governance needs to pay attention to not open more channels than this value.
		 */
		MaxActiveOutboundChannels: PlainDescriptor<number>;
		/**
		 * The maximal page size for HRMP message pages.
		 *
		 * A lower limit can be set dynamically, but this is the hard-limit for the PoV worst case
		 * benchmarking. The limit for the size of a message is slightly below this, since some
		 * overhead is incurred for encoding the format.
		 */
		MaxPageSize: PlainDescriptor<number>;
	};
	PolkadotXcm: {
		/**
		 * This chain's Universal Location.
		 */
		UniversalLocation: PlainDescriptor<XcmV5Junctions>;
		/**
		 * The latest supported version that we advertise. Generally just set it to
		 * `pallet_xcm::CurrentXcmVersion`.
		 */
		AdvertisedXcmVersion: PlainDescriptor<number>;
		/**
		 * The maximum number of local XCM locks that a single account may have.
		 */
		MaxLockers: PlainDescriptor<number>;
		/**
		 * The maximum number of consumers a single remote lock may have.
		 */
		MaxRemoteLockConsumers: PlainDescriptor<number>;
	};
	MessageQueue: {
		/**
		 * The size of the page; this implies the maximum message size which can be sent.
		 *
		 * A good value depends on the expected message sizes, their weights, the weight that is
		 * available for processing them and the maximal needed message size. The maximal message
		 * size is slightly lower than this as defined by [`MaxMessageLenOf`].
		 */
		HeapSize: PlainDescriptor<number>;
		/**
		 * The maximum number of stale pages (i.e. of overweight messages) allowed before culling
		 * can happen. Once there are more stale pages than this, then historical pages may be
		 * dropped, even if they contain unprocessed overweight messages.
		 */
		MaxStale: PlainDescriptor<number>;
		/**
		 * The amount of weight (if any) which should be provided to the message queue for
		 * servicing enqueued items `on_initialize`.
		 *
		 * This may be legitimately `None` in the case that you will call
		 * `ServiceQueues::service_queues` manually or set [`Self::IdleMaxServiceWeight`] to have
		 * it run in `on_idle`.
		 */
		ServiceWeight: PlainDescriptor<Anonymize<Iasb8k6ash5mjn>>;
		/**
		 * The maximum amount of weight (if any) to be used from remaining weight `on_idle` which
		 * should be provided to the message queue for servicing enqueued items `on_idle`.
		 * Useful for parachains to process messages at the same block they are received.
		 *
		 * If `None`, it will not call `ServiceQueues::service_queues` in `on_idle`.
		 */
		IdleMaxServiceWeight: PlainDescriptor<Anonymize<Iasb8k6ash5mjn>>;
	};
	Statement: {
		/**
		 * Min balance for priority statements.
		 */
		StatementCost: PlainDescriptor<bigint>;
		/**
		 * Cost of data byte used for priority calculation.
		 */
		ByteCost: PlainDescriptor<bigint>;
		/**
		 * Minimum number of statements allowed per account.
		 */
		MinAllowedStatements: PlainDescriptor<number>;
		/**
		 * Maximum number of statements allowed per account.
		 */
		MaxAllowedStatements: PlainDescriptor<number>;
		/**
		 * Minimum data bytes allowed per account.
		 */
		MinAllowedBytes: PlainDescriptor<number>;
		/**
		 * Maximum data bytes allowed per account.
		 */
		MaxAllowedBytes: PlainDescriptor<number>;
	};
	Revive: {
		/**
		 * The amount of balance a caller has to pay for each byte of storage.
		 *
		 * # Note
		 *
		 * It is safe to change this value on a live chain as all refunds are pro rata.
		 */
		DepositPerByte: PlainDescriptor<bigint>;
		/**
		 * The amount of balance a caller has to pay for each storage item.
		 *
		 * # Note
		 *
		 * It is safe to change this value on a live chain as all refunds are pro rata.
		 */
		DepositPerItem: PlainDescriptor<bigint>;
		/**
		 * The amount of balance a caller has to pay for each child trie storage item.
		 *
		 * Those are the items created by a contract. In Solidity each value is a single
		 * storage item. This is why we need to set a lower value here than for the main
		 * trie items. Otherwise the storage deposit is too high.
		 *
		 * # Note
		 *
		 * It is safe to change this value on a live chain as all refunds are pro rata.
		 */
		DepositPerChildTrieItem: PlainDescriptor<bigint>;
		/**
		 * The percentage of the storage deposit that should be held for using a code hash.
		 * Instantiating a contract, protects the code from being removed. In order to prevent
		 * abuse these actions are protected with a percentage of the code deposit.
		 */
		CodeHashLockupDepositPercent: PlainDescriptor<number>;
		/**
		 * Make contract callable functions marked as `#[unstable]` available.
		 *
		 * Contracts that use `#[unstable]` functions won't be able to be uploaded unless
		 * this is set to `true`. This is only meant for testnets and dev nodes in order to
		 * experiment with new features.
		 *
		 * # Warning
		 *
		 * Do **not** set to `true` on productions chains.
		 */
		UnsafeUnstableInterface: PlainDescriptor<boolean>;
		/**
		 * Allow EVM bytecode to be uploaded and instantiated.
		 */
		AllowEVMBytecode: PlainDescriptor<boolean>;
		/**
		 * The [EIP-155](https://eips.ethereum.org/EIPS/eip-155) chain ID.
		 *
		 * This is a unique identifier assigned to each blockchain network,
		 * preventing replay attacks.
		 */
		ChainId: PlainDescriptor<bigint>;
		/**
		 * The ratio between the decimal representation of the native token and the ETH token.
		 */
		NativeToEthRatio: PlainDescriptor<number>;
		/**
		 * The fraction the maximum extrinsic weight `eth_transact` extrinsics are capped to.
		 *
		 * This is not a security measure but a requirement due to how we map gas to `(Weight,
		 * StorageDeposit)`. The mapping might derive a `Weight` that is too large to fit into an
		 * extrinsic. In this case we cap it to the limit specified here.
		 *
		 * `eth_transact` transactions that use more weight than specified will fail with an out of
		 * gas error during execution. Larger fractions will allow more transactions to run.
		 * Smaller values waste less block space: Choose as small as possible and as large as
		 * necessary.
		 *
		 * Default: `0.5`.
		 */
		MaxEthExtrinsicWeight: PlainDescriptor<bigint>;
		/**
		 * Allows debug-mode configuration, such as enabling unlimited contract size.
		 */
		DebugEnabled: PlainDescriptor<boolean>;
		/**
		 * This determines the relative scale of our gas price and gas estimates.
		 *
		 * By default, the gas price (in wei) is `FeeInfo::next_fee_multiplier()` multiplied by
		 * `NativeToEthRatio`. `GasScale` allows to scale this value: the actual gas price is the
		 * default gas price multiplied by `GasScale`.
		 *
		 * As a consequence, gas cost (gas estimates and actual gas usage during transaction) is
		 * scaled down by the same factor. Thus, the total transaction cost is not affected by
		 * `GasScale` – apart from rounding differences: the transaction cost is always a multiple
		 * of the gas price and is derived by rounded up, so that with higher `GasScales` this can
		 * lead to higher gas cost as the rounding difference would be larger.
		 *
		 * The main purpose of changing the `GasScale` is to tune the gas cost so that it is closer
		 * to standard EVM gas cost and contracts will not run out of gas when tools or code
		 * assume hard coded gas limits.
		 *
		 * Requirement: `GasScale` must not be 0
		 */
		GasScale: PlainDescriptor<number>;
	};
};
type IViewFns = {};
type IRuntimeCalls = {
	/**
	 * API necessary for block authorship with aura.
	 */
	AuraApi: {
		/**
		 * Returns the slot duration for Aura.
		 *
		 * Currently, only the value provided by this type at genesis will be used.
		 */
		slot_duration: RuntimeDescriptor<[], bigint>;
		/**
		 * Return the current set of authorities.
		 */
		authorities: RuntimeDescriptor<[], Anonymize<Ic5m5lp1oioo8r>>;
	};
	/**
	 * This runtime API is used to inform potential block authors whether they will
	 * have the right to author at a slot, assuming they have claimed the slot.
	 *
	 * In particular, this API allows Aura-based parachains to regulate their "unincluded segment",
	 * which is the section of the head of the chain which has not yet been made available in the
	 * relay chain.
	 *
	 * When the unincluded segment is short, Aura chains will allow authors to create multiple
	 * blocks per slot in order to build a backlog. When it is saturated, this API will limit
	 * the amount of blocks that can be created.
	 *
	 * Changes:
	 * - Version 2: Update to `can_build_upon` to take a relay chain `Slot` instead of a parachain `Slot`.
	 */
	AuraUnincludedSegmentApi: {
		/**
		 * Whether it is legal to extend the chain, assuming the given block is the most
		 * recently included one as-of the relay parent that will be built against, and
		 * the given relay chain slot.
		 *
		 * This should be consistent with the logic the runtime uses when validating blocks to
		 * avoid issues.
		 *
		 * When the unincluded segment is empty, i.e. `included_hash == at`, where at is the block
		 * whose state we are querying against, this must always return `true` as long as the slot
		 * is more recent than the included block itself.
		 */
		can_build_upon: RuntimeDescriptor<
			[included_hash: FixedSizeBinary<32>, slot: bigint],
			boolean
		>;
	};
	/**
	 * The `Core` runtime api that every Substrate runtime needs to implement.
	 */
	Core: {
		/**
		 * Returns the version of the runtime.
		 */
		version: RuntimeDescriptor<[], Anonymize<I4fo08joqmcqnm>>;
		/**
		 * Execute the given block.
		 */
		execute_block: RuntimeDescriptor<[block: Anonymize<Iaqet9jc3ihboe>], undefined>;
		/**
		 * Initialize a block with the given header and return the runtime executive mode.
		 */
		initialize_block: RuntimeDescriptor<
			[header: Anonymize<Ic952bubvq4k7d>],
			Anonymize<I2v50gu3s1aqk6>
		>;
	};
	/**
	 * The `Metadata` api trait that returns metadata for the runtime.
	 */
	Metadata: {
		/**
		 * Returns the metadata of a runtime.
		 */
		metadata: RuntimeDescriptor<[], Binary>;
		/**
		 * Returns the metadata at a given version.
		 *
		 * If the given `version` isn't supported, this will return `None`.
		 * Use [`Self::metadata_versions`] to find out about supported metadata version of the runtime.
		 */
		metadata_at_version: RuntimeDescriptor<[version: number], Anonymize<Iabpgqcjikia83>>;
		/**
		 * Returns the supported metadata versions.
		 *
		 * This can be used to call `metadata_at_version`.
		 */
		metadata_versions: RuntimeDescriptor<[], Anonymize<Icgljjb6j82uhn>>;
	};
	/**
	 * Runtime API for executing view functions
	 */
	RuntimeViewFunction: {
		/**
		 * Execute a view function query.
		 */
		execute_view_function: RuntimeDescriptor<
			[query_id: Anonymize<I4gil44d08grh>, input: Binary],
			Anonymize<I7u915mvkdsb08>
		>;
	};
	/**
	 * The `BlockBuilder` api trait that provides the required functionality for building a block.
	 */
	BlockBuilder: {
		/**
		 * Apply the given extrinsic.
		 *
		 * Returns an inclusion outcome which specifies if this extrinsic is included in
		 * this block or not.
		 */
		apply_extrinsic: RuntimeDescriptor<[extrinsic: Binary], Anonymize<I51fc7k1hjr1t8>>;
		/**
		 * Finish the current block.
		 */
		finalize_block: RuntimeDescriptor<[], Anonymize<Ic952bubvq4k7d>>;
		/**
		 * Generate inherent extrinsics. The inherent data will vary from chain to chain.
		 */
		inherent_extrinsics: RuntimeDescriptor<
			[inherent: Anonymize<If7uv525tdvv7a>],
			Anonymize<Itom7fk49o0c9>
		>;
		/**
		 * Check that the inherents are valid. The inherent data will vary from chain to chain.
		 */
		check_inherents: RuntimeDescriptor<
			[block: Anonymize<Iaqet9jc3ihboe>, data: Anonymize<If7uv525tdvv7a>],
			Anonymize<I2an1fs2eiebjp>
		>;
	};
	/**
	 * The `TaggedTransactionQueue` api trait for interfering with the transaction queue.
	 */
	TaggedTransactionQueue: {
		/**
		 * Validate the transaction.
		 *
		 * This method is invoked by the transaction pool to learn details about given transaction.
		 * The implementation should make sure to verify the correctness of the transaction
		 * against current state. The given `block_hash` corresponds to the hash of the block
		 * that is used as current state.
		 *
		 * Note that this call may be performed by the pool multiple times and transactions
		 * might be verified in any possible order.
		 */
		validate_transaction: RuntimeDescriptor<
			[
				source: TransactionValidityTransactionSource,
				tx: Binary,
				block_hash: FixedSizeBinary<32>,
			],
			Anonymize<I9ask1o4tfvcvs>
		>;
	};
	/**
	 * The offchain worker api.
	 */
	OffchainWorkerApi: {
		/**
		 * Starts the off-chain task for given block header.
		 */
		offchain_worker: RuntimeDescriptor<[header: Anonymize<Ic952bubvq4k7d>], undefined>;
	};
	/**
	 * Session keys runtime api.
	 */
	SessionKeys: {
		/**
		 * Generate a set of session keys with optionally using the given seed.
		 * The keys should be stored within the keystore exposed via runtime
		 * externalities.
		 *
		 * The seed needs to be a valid `utf8` string.
		 *
		 * Returns the concatenated SCALE encoded public keys.
		 */
		generate_session_keys: RuntimeDescriptor<[seed: Anonymize<Iabpgqcjikia83>], Binary>;
		/**
		 * Decode the given public session keys.
		 *
		 * Returns the list of public raw public keys + key type.
		 */
		decode_session_keys: RuntimeDescriptor<[encoded: Binary], Anonymize<Icerf8h8pdu8ss>>;
	};
	/**
	 * The API to query account nonce.
	 */
	AccountNonceApi: {
		/**
		 * Get current account nonce of given `AccountId`.
		 */
		account_nonce: RuntimeDescriptor<[account: SS58String], number>;
	};
	/**
    
     */
	TransactionPaymentApi: {
		/**
        
         */
		query_info: RuntimeDescriptor<[uxt: Binary, len: number], Anonymize<I6spmpef2c7svf>>;
		/**
        
         */
		query_fee_details: RuntimeDescriptor<[uxt: Binary, len: number], Anonymize<Iei2mvq0mjvt81>>;
		/**
        
         */
		query_weight_to_fee: RuntimeDescriptor<[weight: Anonymize<I4q39t5hn830vp>], bigint>;
		/**
        
         */
		query_length_to_fee: RuntimeDescriptor<[length: number], bigint>;
	};
	/**
    
     */
	TransactionPaymentCallApi: {
		/**
		 * Query information of a dispatch class, weight, and fee of a given encoded `Call`.
		 */
		query_call_info: RuntimeDescriptor<
			[call: Anonymize<Ifeps06gn4308f>, len: number],
			Anonymize<I6spmpef2c7svf>
		>;
		/**
		 * Query fee details of a given encoded `Call`.
		 */
		query_call_fee_details: RuntimeDescriptor<
			[call: Anonymize<Ifeps06gn4308f>, len: number],
			Anonymize<Iei2mvq0mjvt81>
		>;
		/**
		 * Query the output of the current `WeightToFee` given some input.
		 */
		query_weight_to_fee: RuntimeDescriptor<[weight: Anonymize<I4q39t5hn830vp>], bigint>;
		/**
		 * Query the output of the current `LengthToFee` given some input.
		 */
		query_length_to_fee: RuntimeDescriptor<[length: number], bigint>;
	};
	/**
	 * Runtime api to collect information about a collation.
	 *
	 * Version history:
	 * - Version 2: Changed [`Self::collect_collation_info`] signature
	 * - Version 3: Signals to the node to use version 1 of [`ParachainBlockData`].
	 */
	CollectCollationInfo: {
		/**
		 * Collect information about a collation.
		 *
		 * The given `header` is the header of the built block for that
		 * we are collecting the collation info for.
		 */
		collect_collation_info: RuntimeDescriptor<
			[header: Anonymize<Ic952bubvq4k7d>],
			Anonymize<Ic1d4u2opv3fst>
		>;
	};
	/**
	 * Runtime API trait for statement validation.
	 */
	ValidateStatement: {
		/**
		 * Validate the statement.
		 */
		validate_statement: RuntimeDescriptor<
			[source: Anonymize<Ico18ks790i2bl>, statement: Anonymize<I815pbp5omtss>],
			Anonymize<I3ju6ot8lfmk90>
		>;
	};
	/**
	 * API to interact with `RuntimeGenesisConfig` for the runtime
	 */
	GenesisBuilder: {
		/**
		 * Build `RuntimeGenesisConfig` from a JSON blob not using any defaults and store it in the
		 * storage.
		 *
		 * In the case of a FRAME-based runtime, this function deserializes the full
		 * `RuntimeGenesisConfig` from the given JSON blob and puts it into the storage. If the
		 * provided JSON blob is incorrect or incomplete or the deserialization fails, an error
		 * is returned.
		 *
		 * Please note that provided JSON blob must contain all `RuntimeGenesisConfig` fields, no
		 * defaults will be used.
		 */
		build_state: RuntimeDescriptor<[json: Binary], Anonymize<Ie9sr1iqcg3cgm>>;
		/**
		 * Returns a JSON blob representation of the built-in `RuntimeGenesisConfig` identified by
		 * `id`.
		 *
		 * If `id` is `None` the function should return JSON blob representation of the default
		 * `RuntimeGenesisConfig` struct of the runtime. Implementation must provide default
		 * `RuntimeGenesisConfig`.
		 *
		 * Otherwise function returns a JSON representation of the built-in, named
		 * `RuntimeGenesisConfig` preset identified by `id`, or `None` if such preset does not
		 * exist. Returned `Vec<u8>` contains bytes of JSON blob (patch) which comprises a list of
		 * (potentially nested) key-value pairs that are intended for customizing the default
		 * runtime genesis config. The patch shall be merged (rfc7386) with the JSON representation
		 * of the default `RuntimeGenesisConfig` to create a comprehensive genesis config that can
		 * be used in `build_state` method.
		 */
		get_preset: RuntimeDescriptor<[id: Anonymize<I1mqgk2tmnn9i2>], Anonymize<Iabpgqcjikia83>>;
		/**
		 * Returns a list of identifiers for available builtin `RuntimeGenesisConfig` presets.
		 *
		 * The presets from the list can be queried with [`GenesisBuilder::get_preset`] method. If
		 * no named presets are provided by the runtime the list is empty.
		 */
		preset_names: RuntimeDescriptor<[], Anonymize<I6lr8sctk0bi4e>>;
	};
	/**
	 * The API used to dry-run contract interactions.
	 */
	ReviveApi: {
		/**
		 * Returns the current ETH block.
		 *
		 * This is one block behind the substrate block.
		 */
		eth_block: RuntimeDescriptor<[], Anonymize<I10nrsmn0hji4l>>;
		/**
		 * Returns the ETH block hash for the given block number.
		 */
		eth_block_hash: RuntimeDescriptor<
			[number: Anonymize<I4totqt881mlti>],
			Anonymize<I4s6vifaf8k998>
		>;
		/**
		 * The details needed to reconstruct the receipt information offchain.
		 *
		 * # Note
		 *
		 * Each entry corresponds to the appropriate Ethereum transaction in the current block.
		 */
		eth_receipt_data: RuntimeDescriptor<[], Anonymize<I3oiqcurom3m43>>;
		/**
		 * Returns the block gas limit.
		 */
		block_gas_limit: RuntimeDescriptor<[], Anonymize<I4totqt881mlti>>;
		/**
		 * Returns the free balance of the given `[H160]` address, using EVM decimals.
		 */
		balance: RuntimeDescriptor<[address: FixedSizeBinary<20>], Anonymize<I4totqt881mlti>>;
		/**
		 * Returns the gas price.
		 */
		gas_price: RuntimeDescriptor<[], Anonymize<I4totqt881mlti>>;
		/**
		 * Returns the nonce of the given `[H160]` address.
		 */
		nonce: RuntimeDescriptor<[address: FixedSizeBinary<20>], number>;
		/**
		 * Perform a call from a specified account to a given contract.
		 *
		 * See [`crate::Pallet::bare_call`].
		 */
		call: RuntimeDescriptor<
			[
				origin: SS58String,
				dest: FixedSizeBinary<20>,
				value: bigint,
				gas_limit: Anonymize<Iasb8k6ash5mjn>,
				storage_deposit_limit: Anonymize<I35p85j063s0il>,
				input_data: Binary,
			],
			Anonymize<I4ehfioavudv4i>
		>;
		/**
		 * Instantiate a new contract.
		 *
		 * See `[crate::Pallet::bare_instantiate]`.
		 */
		instantiate: RuntimeDescriptor<
			[
				origin: SS58String,
				value: bigint,
				gas_limit: Anonymize<Iasb8k6ash5mjn>,
				storage_deposit_limit: Anonymize<I35p85j063s0il>,
				code: Anonymize<I9sijb8gfrns29>,
				data: Binary,
				salt: Anonymize<I4s6vifaf8k998>,
			],
			Anonymize<I6be913iq796os>
		>;
		/**
		 * Perform an Ethereum call.
		 *
		 * Deprecated use `v2` version instead.
		 * See [`crate::Pallet::dry_run_eth_transact`]
		 */
		eth_transact: RuntimeDescriptor<[tx: Anonymize<I6f9v7emp7t5ba>], Anonymize<Ida7d8eqrkav55>>;
		/**
		 * Perform an Ethereum call.
		 *
		 * See [`crate::Pallet::dry_run_eth_transact`]
		 */
		eth_transact_with_config: RuntimeDescriptor<
			[tx: Anonymize<I6f9v7emp7t5ba>, config: Anonymize<Idmrtv8jbbitnu>],
			Anonymize<Ida7d8eqrkav55>
		>;
		/**
		 * Upload new code without instantiating a contract from it.
		 *
		 * See [`crate::Pallet::bare_upload_code`].
		 */
		upload_code: RuntimeDescriptor<
			[origin: SS58String, code: Binary, storage_deposit_limit: Anonymize<I35p85j063s0il>],
			Anonymize<Iabkm12ro9ocjb>
		>;
		/**
		 * Query a given storage key in a given contract.
		 *
		 * Returns `Ok(Some(Vec<u8>))` if the storage value exists under the given key in the
		 * specified account and `Ok(None)` if it doesn't. If the account specified by the address
		 * doesn't exist, or doesn't have a contract then `Err` is returned.
		 */
		get_storage: RuntimeDescriptor<
			[address: FixedSizeBinary<20>, key: FixedSizeBinary<32>],
			Anonymize<I4auf8deg30s4e>
		>;
		/**
		 * Query a given variable-sized storage key in a given contract.
		 *
		 * Returns `Ok(Some(Vec<u8>))` if the storage value exists under the given key in the
		 * specified account and `Ok(None)` if it doesn't. If the account specified by the address
		 * doesn't exist, or doesn't have a contract then `Err` is returned.
		 */
		get_storage_var_key: RuntimeDescriptor<
			[address: FixedSizeBinary<20>, key: Binary],
			Anonymize<I4auf8deg30s4e>
		>;
		/**
		 * Traces the execution of an entire block and returns call traces.
		 *
		 * This is intended to be called through `state_call` to replay the block from the
		 * parent block.
		 *
		 * See eth-rpc `debug_traceBlockByNumber` for usage.
		 */
		trace_block: RuntimeDescriptor<
			[block: Anonymize<Iaqet9jc3ihboe>, config: Anonymize<I63nhnkgg114n5>],
			Anonymize<I1l7ajs6s9ur3a>
		>;
		/**
		 * Traces the execution of a specific transaction within a block.
		 *
		 * This is intended to be called through `state_call` to replay the block from the
		 * parent hash up to the transaction.
		 *
		 * See eth-rpc `debug_traceTransaction` for usage.
		 */
		trace_tx: RuntimeDescriptor<
			[block: Anonymize<Iaqet9jc3ihboe>, tx_index: number, config: Anonymize<I63nhnkgg114n5>],
			Anonymize<Ice9mpbhevl5b7>
		>;
		/**
		 * Dry run and return the trace of the given call.
		 *
		 * See eth-rpc `debug_traceCall` for usage.
		 */
		trace_call: RuntimeDescriptor<
			[tx: Anonymize<I6f9v7emp7t5ba>, config: Anonymize<I63nhnkgg114n5>],
			Anonymize<Idt5popft6i714>
		>;
		/**
		 * The address of the validator that produced the current block.
		 */
		block_author: RuntimeDescriptor<[], FixedSizeBinary<20>>;
		/**
		 * Get the H160 address associated to this account id
		 */
		address: RuntimeDescriptor<[account_id: SS58String], FixedSizeBinary<20>>;
		/**
		 * Get the account id associated to this H160 address.
		 */
		account_id: RuntimeDescriptor<[address: FixedSizeBinary<20>], SS58String>;
		/**
		 * The address used to call the runtime's pallets dispatchables
		 */
		runtime_pallets_address: RuntimeDescriptor<[], FixedSizeBinary<20>>;
		/**
		 * The code at the specified address taking pre-compiles into account.
		 */
		code: RuntimeDescriptor<[address: FixedSizeBinary<20>], Binary>;
		/**
		 * Construct the new balance and dust components of this EVM balance.
		 */
		new_balance_with_dust: RuntimeDescriptor<
			[balance: Anonymize<I4totqt881mlti>],
			Anonymize<I512dtcl0pn07c>
		>;
	};
};
export type Stack_templateDispatchError = Anonymize<I9534japht9jdl>;
type IAsset = PlainDescriptor<void>;
export type Stack_templateExtensions = {};
type PalletsTypedef = {
	__storage: IStorage;
	__tx: ICalls;
	__event: IEvent;
	__error: IError;
	__const: IConstants;
	__view: IViewFns;
};
export type Stack_template = {
	descriptors: {
		pallets: PalletsTypedef;
		apis: IRuntimeCalls;
	} & Promise<any>;
	metadataTypes: Promise<Uint8Array>;
	asset: IAsset;
	extensions: Stack_templateExtensions;
	getMetadata: () => Promise<Uint8Array>;
	genesis: string | undefined;
};
declare const _allDescriptors: Stack_template;
export default _allDescriptors;
export type Stack_templateApis = ApisFromDef<IRuntimeCalls>;
export type Stack_templateQueries = QueryFromPalletsDef<PalletsTypedef>;
export type Stack_templateCalls = TxFromPalletsDef<PalletsTypedef>;
export type Stack_templateEvents = EventsFromPalletsDef<PalletsTypedef>;
export type Stack_templateErrors = ErrorsFromPalletsDef<PalletsTypedef>;
export type Stack_templateConstants = ConstFromPalletsDef<PalletsTypedef>;
export type Stack_templateViewFns = ViewFnsFromPalletsDef<PalletsTypedef>;
export type Stack_templateCallData = Anonymize<Ifeps06gn4308f> & {
	value: {
		type: string;
	};
};
type AllInteractions = {
	storage: {
		System: [
			"Account",
			"ExtrinsicCount",
			"InherentsApplied",
			"BlockWeight",
			"AllExtrinsicsLen",
			"BlockHash",
			"ExtrinsicData",
			"Number",
			"ParentHash",
			"Digest",
			"Events",
			"EventCount",
			"EventTopics",
			"LastRuntimeUpgrade",
			"UpgradedToU32RefCount",
			"UpgradedToTripleRefCount",
			"ExecutionPhase",
			"AuthorizedUpgrade",
			"ExtrinsicWeightReclaimed",
		];
		ParachainSystem: [
			"UnincludedSegment",
			"AggregatedUnincludedSegment",
			"PendingValidationCode",
			"NewValidationCode",
			"ValidationData",
			"DidSetValidationCode",
			"LastRelayChainBlockNumber",
			"UpgradeRestrictionSignal",
			"UpgradeGoAhead",
			"RelayStateProof",
			"RelevantMessagingState",
			"HostConfiguration",
			"LastDmqMqcHead",
			"LastHrmpMqcHeads",
			"ProcessedDownwardMessages",
			"LastProcessedDownwardMessage",
			"HrmpWatermark",
			"LastProcessedHrmpMessage",
			"HrmpOutboundMessages",
			"UpwardMessages",
			"PendingUpwardMessages",
			"PendingUpwardSignals",
			"UpwardDeliveryFeeFactor",
			"AnnouncedHrmpMessagesPerCandidate",
			"ReservedXcmpWeightOverride",
			"ReservedDmpWeightOverride",
			"CustomValidationHeadData",
		];
		Timestamp: ["Now", "DidUpdate"];
		ParachainInfo: ["ParachainId"];
		Balances: [
			"TotalIssuance",
			"InactiveIssuance",
			"Account",
			"Locks",
			"Reserves",
			"Holds",
			"Freezes",
		];
		TransactionPayment: ["NextFeeMultiplier", "StorageVersion", "TxPaymentCredit"];
		Sudo: ["Key"];
		Multisig: ["Multisigs"];
		Authorship: ["Author"];
		CollatorSelection: [
			"Invulnerables",
			"CandidateList",
			"LastAuthoredBlock",
			"DesiredCandidates",
			"CandidacyBond",
		];
		Session: [
			"Validators",
			"CurrentIndex",
			"QueuedChanged",
			"QueuedKeys",
			"DisabledValidators",
			"NextKeys",
			"KeyOwner",
			"ExternallySetKeys",
		];
		Aura: ["Authorities", "CurrentSlot"];
		AuraExt: ["Authorities", "RelaySlotInfo"];
		XcmpQueue: [
			"InboundXcmpSuspended",
			"OutboundXcmpStatus",
			"OutboundXcmpMessages",
			"SignalMessages",
			"QueueConfig",
			"QueueSuspended",
			"DeliveryFeeFactor",
		];
		PolkadotXcm: [
			"QueryCounter",
			"Queries",
			"AssetTraps",
			"SafeXcmVersion",
			"SupportedVersion",
			"VersionNotifiers",
			"VersionNotifyTargets",
			"VersionDiscoveryQueue",
			"CurrentMigration",
			"RemoteLockedFungibles",
			"LockedFungibles",
			"XcmExecutionSuspended",
			"ShouldRecordXcm",
			"RecordedXcm",
			"AuthorizedAliases",
		];
		MessageQueue: ["BookStateFor", "ServiceHead", "Pages"];
		TemplatePallet: ["Claims"];
		Revive: [
			"PristineCode",
			"CodeInfoOf",
			"AccountInfoOf",
			"ImmutableDataOf",
			"DeletionQueue",
			"DeletionQueueCounter",
			"OriginalAccount",
			"EthereumBlock",
			"BlockHash",
			"ReceiptInfoData",
			"EthBlockBuilderIR",
			"EthBlockBuilderFirstValues",
			"DebugSettingsOf",
		];
	};
	tx: {
		System: [
			"remark",
			"set_heap_pages",
			"set_code",
			"set_code_without_checks",
			"set_storage",
			"kill_storage",
			"kill_prefix",
			"remark_with_event",
			"authorize_upgrade",
			"authorize_upgrade_without_checks",
			"apply_authorized_upgrade",
		];
		ParachainSystem: ["set_validation_data", "sudo_send_upward_message"];
		Timestamp: ["set"];
		Balances: [
			"transfer_allow_death",
			"force_transfer",
			"transfer_keep_alive",
			"transfer_all",
			"force_unreserve",
			"upgrade_accounts",
			"force_set_balance",
			"force_adjust_total_issuance",
			"burn",
		];
		Sudo: ["sudo", "sudo_unchecked_weight", "set_key", "sudo_as", "remove_key"];
		Multisig: [
			"as_multi_threshold_1",
			"as_multi",
			"approve_as_multi",
			"cancel_as_multi",
			"poke_deposit",
		];
		CollatorSelection: [
			"set_invulnerables",
			"set_desired_candidates",
			"set_candidacy_bond",
			"register_as_candidate",
			"leave_intent",
			"add_invulnerable",
			"remove_invulnerable",
			"update_bond",
			"take_candidate_slot",
		];
		Session: ["set_keys", "purge_keys"];
		XcmpQueue: [
			"suspend_xcm_execution",
			"resume_xcm_execution",
			"update_suspend_threshold",
			"update_drop_threshold",
			"update_resume_threshold",
		];
		PolkadotXcm: [
			"send",
			"teleport_assets",
			"reserve_transfer_assets",
			"execute",
			"force_xcm_version",
			"force_default_xcm_version",
			"force_subscribe_version_notify",
			"force_unsubscribe_version_notify",
			"limited_reserve_transfer_assets",
			"limited_teleport_assets",
			"force_suspension",
			"transfer_assets",
			"claim_assets",
			"transfer_assets_using_type_and_then",
			"add_authorized_alias",
			"remove_authorized_alias",
			"remove_all_authorized_aliases",
		];
		MessageQueue: ["reap_page", "execute_overweight"];
		TemplatePallet: ["create_claim", "revoke_claim"];
		Revive: [
			"eth_transact",
			"call",
			"instantiate",
			"instantiate_with_code",
			"eth_instantiate_with_code",
			"eth_call",
			"eth_substrate_call",
			"upload_code",
			"remove_code",
			"set_code",
			"map_account",
			"unmap_account",
			"dispatch_as_fallback_account",
		];
	};
	events: {
		System: [
			"ExtrinsicSuccess",
			"ExtrinsicFailed",
			"CodeUpdated",
			"NewAccount",
			"KilledAccount",
			"Remarked",
			"UpgradeAuthorized",
			"RejectedInvalidAuthorizedUpgrade",
		];
		ParachainSystem: [
			"ValidationFunctionStored",
			"ValidationFunctionApplied",
			"ValidationFunctionDiscarded",
			"DownwardMessagesReceived",
			"DownwardMessagesProcessed",
			"UpwardMessageSent",
		];
		Balances: [
			"Endowed",
			"DustLost",
			"Transfer",
			"BalanceSet",
			"Reserved",
			"Unreserved",
			"ReserveRepatriated",
			"Deposit",
			"Withdraw",
			"Slashed",
			"Minted",
			"MintedCredit",
			"Burned",
			"BurnedDebt",
			"Suspended",
			"Restored",
			"Upgraded",
			"Issued",
			"Rescinded",
			"Locked",
			"Unlocked",
			"Frozen",
			"Thawed",
			"TotalIssuanceForced",
			"Held",
			"BurnedHeld",
			"TransferOnHold",
			"TransferAndHold",
			"Released",
			"Unexpected",
		];
		TransactionPayment: ["TransactionFeePaid"];
		Sudo: ["Sudid", "KeyChanged", "KeyRemoved", "SudoAsDone"];
		Multisig: [
			"NewMultisig",
			"MultisigApproval",
			"MultisigExecuted",
			"MultisigCancelled",
			"DepositPoked",
		];
		CollatorSelection: [
			"NewInvulnerables",
			"InvulnerableAdded",
			"InvulnerableRemoved",
			"NewDesiredCandidates",
			"NewCandidacyBond",
			"CandidateAdded",
			"CandidateBondUpdated",
			"CandidateRemoved",
			"CandidateReplaced",
			"InvalidInvulnerableSkipped",
		];
		Session: ["NewSession", "NewQueued", "ValidatorDisabled", "ValidatorReenabled"];
		XcmpQueue: ["XcmpMessageSent"];
		PolkadotXcm: [
			"Attempted",
			"Sent",
			"SendFailed",
			"ProcessXcmError",
			"UnexpectedResponse",
			"ResponseReady",
			"Notified",
			"NotifyOverweight",
			"NotifyDispatchError",
			"NotifyDecodeFailed",
			"InvalidResponder",
			"InvalidResponderVersion",
			"ResponseTaken",
			"AssetsTrapped",
			"VersionChangeNotified",
			"SupportedVersionChanged",
			"NotifyTargetSendFail",
			"NotifyTargetMigrationFail",
			"InvalidQuerierVersion",
			"InvalidQuerier",
			"VersionNotifyStarted",
			"VersionNotifyRequested",
			"VersionNotifyUnrequested",
			"FeesPaid",
			"AssetsClaimed",
			"VersionMigrationFinished",
			"AliasAuthorized",
			"AliasAuthorizationRemoved",
			"AliasesAuthorizationsRemoved",
		];
		CumulusXcm: ["InvalidFormat", "UnsupportedVersion", "ExecutedDownward"];
		MessageQueue: ["ProcessingFailed", "Processed", "OverweightEnqueued", "PageReaped"];
		Statement: ["NewStatement"];
		TemplatePallet: ["ClaimCreated", "ClaimRevoked"];
		Revive: ["ContractEmitted", "Instantiated", "EthExtrinsicRevert"];
	};
	errors: {
		System: [
			"InvalidSpecName",
			"SpecVersionNeedsToIncrease",
			"FailedToExtractRuntimeVersion",
			"NonDefaultComposite",
			"NonZeroRefCount",
			"CallFiltered",
			"MultiBlockMigrationsOngoing",
			"NothingAuthorized",
			"Unauthorized",
		];
		ParachainSystem: [
			"OverlappingUpgrades",
			"ProhibitedByPolkadot",
			"TooBig",
			"ValidationDataNotAvailable",
			"HostConfigurationNotAvailable",
			"NotScheduled",
		];
		Balances: [
			"VestingBalance",
			"LiquidityRestrictions",
			"InsufficientBalance",
			"ExistentialDeposit",
			"Expendability",
			"ExistingVestingSchedule",
			"DeadAccount",
			"TooManyReserves",
			"TooManyHolds",
			"TooManyFreezes",
			"IssuanceDeactivated",
			"DeltaZero",
		];
		Sudo: ["RequireSudo"];
		Multisig: [
			"MinimumThreshold",
			"AlreadyApproved",
			"NoApprovalsNeeded",
			"TooFewSignatories",
			"TooManySignatories",
			"SignatoriesOutOfOrder",
			"SenderInSignatories",
			"NotFound",
			"NotOwner",
			"NoTimepoint",
			"WrongTimepoint",
			"UnexpectedTimepoint",
			"MaxWeightTooLow",
			"AlreadyStored",
		];
		CollatorSelection: [
			"TooManyCandidates",
			"TooFewEligibleCollators",
			"AlreadyCandidate",
			"NotCandidate",
			"TooManyInvulnerables",
			"AlreadyInvulnerable",
			"NotInvulnerable",
			"NoAssociatedValidatorId",
			"ValidatorNotRegistered",
			"InsertToCandidateListFailed",
			"RemoveFromCandidateListFailed",
			"DepositTooLow",
			"UpdateCandidateListFailed",
			"InsufficientBond",
			"TargetIsNotCandidate",
			"IdenticalDeposit",
			"InvalidUnreserve",
		];
		Session: [
			"InvalidProof",
			"NoAssociatedValidatorId",
			"DuplicatedKey",
			"NoKeys",
			"NoAccount",
		];
		XcmpQueue: [
			"BadQueueConfig",
			"AlreadySuspended",
			"AlreadyResumed",
			"TooManyActiveOutboundChannels",
			"TooBig",
		];
		PolkadotXcm: [
			"Unreachable",
			"SendFailure",
			"Filtered",
			"UnweighableMessage",
			"DestinationNotInvertible",
			"Empty",
			"CannotReanchor",
			"TooManyAssets",
			"InvalidOrigin",
			"BadVersion",
			"BadLocation",
			"NoSubscription",
			"AlreadySubscribed",
			"CannotCheckOutTeleport",
			"LowBalance",
			"TooManyLocks",
			"AccountNotSovereign",
			"FeesNotMet",
			"LockNotFound",
			"InUse",
			"InvalidAssetUnknownReserve",
			"InvalidAssetUnsupportedReserve",
			"TooManyReserves",
			"LocalExecutionIncomplete",
			"TooManyAuthorizedAliases",
			"ExpiresInPast",
			"AliasNotFound",
			"LocalExecutionIncompleteWithError",
		];
		MessageQueue: [
			"NotReapable",
			"NoPage",
			"NoMessage",
			"AlreadyProcessed",
			"Queued",
			"InsufficientWeight",
			"TemporarilyUnprocessable",
			"QueuePaused",
			"RecursiveDisallowed",
		];
		TemplatePallet: ["AlreadyClaimed", "NotClaimOwner", "ClaimNotFound"];
		Revive: [
			"InvalidSchedule",
			"InvalidCallFlags",
			"OutOfGas",
			"TransferFailed",
			"MaxCallDepthReached",
			"ContractNotFound",
			"CodeNotFound",
			"CodeInfoNotFound",
			"OutOfBounds",
			"DecodingFailed",
			"ContractTrapped",
			"ValueTooLarge",
			"TerminatedWhileReentrant",
			"InputForwarded",
			"TooManyTopics",
			"DuplicateContract",
			"TerminatedInConstructor",
			"ReentranceDenied",
			"ReenteredPallet",
			"StateChangeDenied",
			"StorageDepositNotEnoughFunds",
			"StorageDepositLimitExhausted",
			"CodeInUse",
			"ContractReverted",
			"CodeRejected",
			"BlobTooLarge",
			"StaticMemoryTooLarge",
			"BasicBlockTooLarge",
			"InvalidInstruction",
			"MaxDelegateDependenciesReached",
			"DelegateDependencyNotFound",
			"DelegateDependencyAlreadyExists",
			"CannotAddSelfAsDelegateDependency",
			"OutOfTransientStorage",
			"InvalidSyscall",
			"InvalidStorageFlags",
			"ExecutionFailed",
			"BalanceConversionFailed",
			"InvalidImmutableAccess",
			"AccountUnmapped",
			"AccountAlreadyMapped",
			"InvalidGenericTransaction",
			"RefcountOverOrUnderflow",
			"UnsupportedPrecompileAddress",
			"CallDataTooLarge",
			"ReturnDataTooLarge",
			"InvalidJump",
			"StackUnderflow",
			"StackOverflow",
			"TxFeeOverdraw",
			"EvmConstructorNonEmptyData",
			"EvmConstructedFromHash",
			"StorageRefundNotEnoughFunds",
			"StorageRefundLocked",
			"PrecompileDelegateDenied",
			"EcdsaRecoveryFailed",
		];
	};
	constants: {
		System: [
			"BlockWeights",
			"BlockLength",
			"BlockHashCount",
			"DbWeight",
			"Version",
			"SS58Prefix",
		];
		ParachainSystem: ["SelfParaId"];
		Timestamp: ["MinimumPeriod"];
		Balances: ["ExistentialDeposit", "MaxLocks", "MaxReserves", "MaxFreezes"];
		TransactionPayment: ["OperationalFeeMultiplier"];
		Multisig: ["DepositBase", "DepositFactor", "MaxSignatories"];
		CollatorSelection: [
			"PotId",
			"MaxCandidates",
			"MinEligibleCollators",
			"MaxInvulnerables",
			"KickThreshold",
			"pot_account",
		];
		Session: ["KeyDeposit"];
		Aura: ["SlotDuration"];
		XcmpQueue: ["MaxInboundSuspended", "MaxActiveOutboundChannels", "MaxPageSize"];
		PolkadotXcm: [
			"UniversalLocation",
			"AdvertisedXcmVersion",
			"MaxLockers",
			"MaxRemoteLockConsumers",
		];
		MessageQueue: ["HeapSize", "MaxStale", "ServiceWeight", "IdleMaxServiceWeight"];
		Statement: [
			"StatementCost",
			"ByteCost",
			"MinAllowedStatements",
			"MaxAllowedStatements",
			"MinAllowedBytes",
			"MaxAllowedBytes",
		];
		Revive: [
			"DepositPerByte",
			"DepositPerItem",
			"DepositPerChildTrieItem",
			"CodeHashLockupDepositPercent",
			"UnsafeUnstableInterface",
			"AllowEVMBytecode",
			"ChainId",
			"NativeToEthRatio",
			"MaxEthExtrinsicWeight",
			"DebugEnabled",
			"GasScale",
		];
	};
	viewFns: {};
	apis: {
		AuraApi: ["slot_duration", "authorities"];
		AuraUnincludedSegmentApi: ["can_build_upon"];
		Core: ["version", "execute_block", "initialize_block"];
		Metadata: ["metadata", "metadata_at_version", "metadata_versions"];
		RuntimeViewFunction: ["execute_view_function"];
		BlockBuilder: [
			"apply_extrinsic",
			"finalize_block",
			"inherent_extrinsics",
			"check_inherents",
		];
		TaggedTransactionQueue: ["validate_transaction"];
		OffchainWorkerApi: ["offchain_worker"];
		SessionKeys: ["generate_session_keys", "decode_session_keys"];
		AccountNonceApi: ["account_nonce"];
		TransactionPaymentApi: [
			"query_info",
			"query_fee_details",
			"query_weight_to_fee",
			"query_length_to_fee",
		];
		TransactionPaymentCallApi: [
			"query_call_info",
			"query_call_fee_details",
			"query_weight_to_fee",
			"query_length_to_fee",
		];
		CollectCollationInfo: ["collect_collation_info"];
		ValidateStatement: ["validate_statement"];
		GenesisBuilder: ["build_state", "get_preset", "preset_names"];
		ReviveApi: [
			"eth_block",
			"eth_block_hash",
			"eth_receipt_data",
			"block_gas_limit",
			"balance",
			"gas_price",
			"nonce",
			"call",
			"instantiate",
			"eth_transact",
			"eth_transact_with_config",
			"upload_code",
			"get_storage",
			"get_storage_var_key",
			"trace_block",
			"trace_tx",
			"trace_call",
			"block_author",
			"address",
			"account_id",
			"runtime_pallets_address",
			"code",
			"new_balance_with_dust",
		];
	};
};
export type Stack_templateWhitelistEntry =
	| PalletKey
	| `query.${NestedKey<AllInteractions["storage"]>}`
	| `tx.${NestedKey<AllInteractions["tx"]>}`
	| `event.${NestedKey<AllInteractions["events"]>}`
	| `error.${NestedKey<AllInteractions["errors"]>}`
	| `const.${NestedKey<AllInteractions["constants"]>}`
	| `view.${NestedKey<AllInteractions["viewFns"]>}`
	| `api.${NestedKey<AllInteractions["apis"]>}`;
type PalletKey = `*.${{
	[K in keyof AllInteractions]: K extends "apis" ? never : keyof AllInteractions[K];
}[keyof AllInteractions]}`;
type NestedKey<D extends Record<string, string[]>> =
	| "*"
	| {
			[P in keyof D & string]: `${P}.*` | `${P}.${D[P][number]}`;
	  }[keyof D & string];
