import ContractProofOfExistencePage from "../components/ContractProofOfExistencePage";
import { deployments } from "../config/deployments";

export default function EvmContractPage() {
  return (
    <ContractProofOfExistencePage
      title="EVM Proof of Existence (solc)"
      description={
        <>
          Claim file hashes via the Solidity contract compiled with{" "}
          <code className="bg-gray-800 px-1 rounded">solc</code> and deployed
          via the eth-rpc proxy. Uses{" "}
          <code className="bg-gray-800 px-1 rounded">viem</code> for contract
          interaction.
        </>
      }
      contractKind="evm"
      accentColor="purple"
      storageKey="evm-contract-address"
      defaultAddress={deployments.evm ?? undefined}
    />
  );
}
