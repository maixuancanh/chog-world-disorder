// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Unofficial game demo assets. No sale, payment, or mainnet deployment.
contract TestChog is ERC20 {
    uint256 public constant MAX_SUPPLY = 100_000_000 ether;
    uint256 public constant CLAIM_AMOUNT = 1_000 ether;
    mapping(address => uint256) public nextClaimAt;

    constructor(address recipient) ERC20("Chog Test Token (Unofficial Demo)", "testCHOG") {
        require(block.chainid == 10143, "Monad testnet only");
        nextClaimAt[recipient] = block.timestamp + 1 days;
        _mint(recipient, 10_000 ether);
    }

    function claim() external {
        require(block.timestamp >= nextClaimAt[msg.sender], "Claim once per day");
        require(totalSupply() + CLAIM_AMOUNT <= MAX_SUPPLY, "Demo supply cap");
        nextClaimAt[msg.sender] = block.timestamp + 1 days;
        _mint(msg.sender, CLAIM_AMOUNT);
    }
}

contract ChogDemoNFT is ERC721Enumerable {
    uint256 public constant MAX_SUPPLY = 1969;
    mapping(address => bool) public hasClaimed;
    string private _demoURI;

    constructor(address recipient, string memory demoURI) ERC721("Chog Demo (Unofficial Testnet)", "demoCHOG") {
        require(block.chainid == 10143, "Monad testnet only");
        _demoURI = demoURI;
        hasClaimed[recipient] = true;
        // _mint intentionally avoids a recipient callback during bootstrap construction.
        _mint(recipient, 1);
    }

    function claim() external {
        require(!hasClaimed[msg.sender], "One demo NFT per wallet");
        require(totalSupply() < MAX_SUPPLY, "Demo supply cap");
        hasClaimed[msg.sender] = true;
        _safeMint(msg.sender, totalSupply() + 1);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _demoURI;
    }
}

contract DemoBootstrap {
    address public immutable nft;
    address public immutable token;

    constructor(string memory demoURI) {
        require(block.chainid == 10143, "Monad testnet only");
        token = address(new TestChog(msg.sender));
        nft = address(new ChogDemoNFT(msg.sender, demoURI));
    }
}

/// @notice Unofficial testnet replica of Genesis art/traits. Ownership is independent of mainnet.
contract ChogGenesisReplica is ERC721Enumerable {
    uint256 public constant MAX_SUPPLY = 1969;
    address public constant SOURCE_COLLECTION = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    uint256 public constant SOURCE_CHAIN_ID = 143;
    string public constant SOURCE_BASE_URI = "ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/";
    mapping(address => bool) public hasClaimed;
    address private _existingToken;
    constructor(address existingToken) ERC721("Chog Genesis Replica (Unofficial Testnet)", "demoCHOG") {
        require(block.chainid == 10143, "Monad testnet only");
        require(existingToken.code.length > 0, "Existing testCHOG required");
        _existingToken = existingToken;
        hasClaimed[msg.sender] = true;
        _mint(msg.sender, 1);
    }
    function token() external view returns (address) { return _existingToken; }
    function claim() external {
        require(!hasClaimed[msg.sender], "One replica per wallet");
        require(totalSupply() < MAX_SUPPLY, "Collection complete");
        hasClaimed[msg.sender] = true;
        _safeMint(msg.sender, totalSupply() + 1);
    }
    function sourceTokenURI(uint256 id) public pure returns (string memory) {
        require(id >= 1 && id <= MAX_SUPPLY, "Invalid Genesis token ID");
        return string.concat(SOURCE_BASE_URI, Strings.toString(((id - 1 + 1461) % MAX_SUPPLY) + 1), ".json");
    }
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return sourceTokenURI(id);
    }
}
